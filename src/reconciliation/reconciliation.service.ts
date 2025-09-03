import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';

// ---------- tipos ----------
type ReconTabs = {
  onlyInInvoice: Array<{ id: string; cpf: string; nome: string; valorCobrado: string }>;
  onlyInRegistry: Array<{ id: string; cpf: string; nome: string; valorMensalidade: string }>;
  mismatched: Array<{ id: string; cpf: string; nome: string; valorCobrado: string; valorMensalidade: string; diferenca: string }>;
  duplicates: Array<{ id: string; cpf: string; nome: string; ocorrencias: number; somaCobrada: string; valores: string[] }>;
  allInvoice: Array<{
    id: string;
    cpf: string;
    nome: string;
    valorCobrado: string;
    valorMensalidade: string;
    diferenca: string;
    status: 'OK' | 'DIVERGENTE' | 'DUPLICADO' | 'SOFATURA';
  }>;
};

type Filters = {
  tipo?: 'TITULAR' | 'DEPENDENTE';
  plano?: string;
  centro?: string;
};

type ReconciliationPayload = {
  ok: boolean;
  clientId: string;
  mesReferencia: string; // YYYY-MM-01
  totals: {
    faturaCount: number;
    ativosCount: number;
    onlyInInvoice: number;
    onlyInRegistry: number;
    mismatched: number;
    duplicates: number;
    okCount: number;

    faturaSum: string;
    okSum: string;
    onlyInInvoiceSum: string;
  };
  filtersApplied: Filters;
  tabs: ReconTabs;
  closure?: {
    status: 'OPEN' | 'CLOSED';
    totalFatura?: string;
    closedAt?: string;
    notes?: string | null;
  };
};

type FaturaRow = {
  id: string;
  nomeCompleto: string | null;
  cpf: string | null;
  valorPlano: unknown;
};

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- helpers ----------
  private ensureYYYYMM(mes?: string | Date): string {
    if (mes instanceof Date) {
      const y = mes.getUTCFullYear();
      const m = String(mes.getUTCMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
    if (mes && /^\d{4}-\d{2}$/.test(mes)) return mes;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  private toYYYYMM01(mesYYYYMM: string) {
    return `${mesYYYYMM}-01`;
  }
  private firstDayUTC(ym: string) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  }
  private nextMonthUTC(d: Date) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0));
  }

  private toNum(v: unknown): number {
    if (v == null) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const original = String(v).trim();
    if (!original) return 0;
    const raw = original.replace(/[^\d.,\-]/g, '');
    let n = 0;
    if (raw.includes(',')) n = Number(raw.replace(/\./g, '').replace(',', '.'));
    else if (raw.includes('.')) n = Number(raw);
    else {
      const asInt = Number(raw);
      n = Number.isInteger(asInt) && raw.length >= 3 ? asInt / 100 : asInt;
    }
    return Number.isFinite(n) ? n : 0;
  }
  private toBRL(n: number) {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  private maskCpf(cpf: string) {
    const d = (cpf || '').replace(/\D/g, '').padStart(11, '•');
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  }

  private makeBenefWhereVigente(clientId: string, filters: Filters, start: Date, next: Date) {
    const where: Prisma.BeneficiarioWhereInput = {
      clientId,
      status: 'ATIVO',
      dataEntrada: { lt: next },
      OR: [{ dataSaida: null }, { dataSaida: { gte: start } }],
    };
    if (filters?.tipo) (where as any).tipo = filters.tipo;
    if (filters?.plano) (where as any).plano = filters.plano;
    if (filters?.centro) (where as any).centroCusto = filters.centro;
    return where;
  }

  // ---------- opções ----------
  async getFilterOptions(clientId: string) {
    const [planos, centros] = await Promise.all([
      this.prisma.beneficiario.findMany({
        where: { clientId, status: 'ATIVO', dataSaida: null },
        distinct: ['plano'],
        select: { plano: true },
        orderBy: { plano: 'asc' },
      }),
      this.prisma.beneficiario.findMany({
        where: { clientId, status: 'ATIVO', dataSaida: null },
        distinct: ['centroCusto'],
        select: { centroCusto: true },
        orderBy: { centroCusto: 'asc' },
      }),
    ]);

    return {
      tipos: ['TITULAR', 'DEPENDENTE'] as const,
      planos: planos.map((p) => p.plano).filter(Boolean) as string[],
      centros: centros.map((c) => c.centroCusto).filter(Boolean) as string[],
    };
  }

  // ---------- conciliação ----------
  async buildReconciliation(
    clientId: string,
    opts?: { mesReferencia?: Date | string; filters?: Filters },
  ): Promise<ReconciliationPayload> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    const ym = this.ensureYYYYMM(opts?.mesReferencia);
    const firstDayStr = this.toYYYYMM01(ym);
    const start = this.firstDayUTC(ym);
    const next = this.nextMonthUTC(start);
    const filters = opts?.filters ?? {};
    const anyFilter = !!(filters.tipo || filters.plano || filters.centro);

    // 1) tenta itens
    let rows = await this.prisma.$queryRaw<FaturaRow[]>(Prisma.sql`
      SELECT i."id", i."nomeCompleto", i."cpf", i."valorPlano"
      FROM "health_imported_invoice_items" i
      JOIN "health_imported_invoices" f ON f."id" = i."faturaId"
      WHERE f."clientId" = ${clientId}
        AND f."mesReferencia" >= ${firstDayStr}::date
        AND f."mesReferencia" < (${firstDayStr}::date + INTERVAL '1 month')
    `);

    // 2) fallback: cabeçalho
    if (rows.length === 0) {
      rows = await this.prisma.$queryRaw<FaturaRow[]>(Prisma.sql`
        SELECT f."id",
               f."nomeBeneficiarioOperadora" AS "nomeCompleto",
               f."cpfBeneficiarioOperadora"  AS "cpf",
               f."valorCobradoOperadora"     AS "valorPlano"
        FROM "health_imported_invoices" f
        WHERE f."clientId" = ${clientId}
          AND f."mesReferencia" >= ${firstDayStr}::date
          AND f."mesReferencia" < (${firstDayStr}::date + INTERVAL '1 month')
      `);
    }

    const flatFatura = rows
      .map((r) => {
        const cpf = (r.cpf ?? '').replace(/\D/g, '');
        if (!cpf) return null;
        return { id: r.id, cpf, nome: r.nomeCompleto ?? '', valor: this.toNum(r.valorPlano) };
      })
      .filter(Boolean) as Array<{ id: string; cpf: string; nome: string; valor: number }>;

    const faturaCount = flatFatura.length;
    const faturaSumNumber = flatFatura.reduce((acc, r) => acc + r.valor, 0);

    // Beneficiários vigentes
    const ativos = await this.prisma.beneficiario.findMany({
      where: this.makeBenefWhereVigente(clientId, filters, start, next),
      select: { id: true, nomeCompleto: true, cpf: true, valorMensalidade: true },
    });

    const mapAtivos = new Map<string, { nome: string; mensalidade: number }>();
    for (const b of ativos) {
      const cpf = (b.cpf ?? '').replace(/\D/g, '');
      if (!cpf) continue;
      mapAtivos.set(cpf, { nome: b.nomeCompleto ?? '', mensalidade: this.toNum(b.valorMensalidade as any) });
    }
    const ativosSet = new Set(mapAtivos.keys());

    // agrega a fatura por CPF
    const byCpf = new Map<string, { nome: string; soma: number; valores: number[]; ids: string[] }>();
    for (const r of flatFatura) {
      const cur = byCpf.get(r.cpf) ?? { nome: r.nome, soma: 0, valores: [], ids: [] };
      cur.nome = cur.nome || r.nome;
      cur.soma += r.valor;
      cur.valores.push(r.valor);
      cur.ids.push(r.id);
      byCpf.set(r.cpf, cur);
    }

    // coleções finais
    const onlyInInvoice: ReconTabs['onlyInInvoice'] = [];
    const onlyInRegistry: ReconTabs['onlyInRegistry'] = [];
    const mismatched: ReconTabs['mismatched'] = [];
    const duplicates: ReconTabs['duplicates'] = [];
    const allInvoice: ReconTabs['allInvoice'] = [];

    // acumuladores
    let onlyInInvoiceSumNum = 0;
    let okSumNum = 0;
    let okCount = 0;

    // cruza fatura x cadastro
    for (const [cpf, info] of byCpf.entries()) {
      const ativo = mapAtivos.get(cpf);

      if (!ativo) {
        if (!anyFilter) {
          onlyInInvoice.push({
            id: info.ids[0] ?? `INV:${cpf}`,
            cpf: this.maskCpf(cpf),
            nome: info.nome || '—',
            valorCobrado: this.toBRL(info.soma),
          });
          onlyInInvoiceSumNum += info.soma;
        }
        continue;
      }

      if (info.valores.length > 1) {
        duplicates.push({
          id: info.ids[0] ?? `DUP:${cpf}`,
          cpf: this.maskCpf(cpf),
          nome: ativo.nome || info.nome || '—',
          ocorrencias: info.valores.length,
          somaCobrada: this.toBRL(info.soma),
          valores: info.valores.map((v) => this.toBRL(v)),
        });
      }

      const diffAbs = Math.abs(info.soma - ativo.mensalidade);
      if (diffAbs > 0.009) {
        mismatched.push({
          id: info.ids[0] ?? `MIS:${cpf}`,
          cpf: this.maskCpf(cpf),
          nome: ativo.nome || info.nome || '—',
          valorCobrado: this.toBRL(info.soma),
          valorMensalidade: this.toBRL(ativo.mensalidade),
          diferenca: this.toBRL(info.soma - ativo.mensalidade),
        });
      } else {
        okSumNum += info.soma;
        okCount += 1;
      }
    }

    // Só no cadastro
    for (const [cpf, ativo] of mapAtivos.entries()) {
      if (!byCpf.has(cpf)) {
        onlyInRegistry.push({
          id: `REG:${cpf}`,
          cpf: this.maskCpf(cpf),
          nome: ativo.nome || '—',
          valorMensalidade: this.toBRL(ativo.mensalidade),
        });
      }
    }

    // Monta a visão "Fatura (todos)"
    for (const r of flatFatura) {
      if (anyFilter && !ativosSet.has(r.cpf)) continue;
      const ativo = mapAtivos.get(r.cpf);
      const mensal = ativo ? ativo.mensalidade : NaN;
      const diff = ativo ? r.valor - mensal : NaN;

      const status: 'OK' | 'DIVERGENTE' | 'DUPLICADO' | 'SOFATURA' =
        !ativo
          ? 'SOFATURA'
          : (byCpf.get(r.cpf)?.valores.length ?? 0) > 1
          ? 'DUPLICADO'
          : Math.abs(diff) > 0.009
          ? 'DIVERGENTE'
          : 'OK';

      allInvoice.push({
        id: r.id,
        cpf: this.maskCpf(r.cpf),
        nome: (ativo?.nome || r.nome || '—') as string,
        valorCobrado: this.toBRL(r.valor),
        valorMensalidade: ativo ? this.toBRL(mensal) : '—',
        diferenca: ativo ? this.toBRL(diff) : '—',
        status,
      });
    }

    // ordenações
    const byNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome);
    onlyInInvoice.sort(byNome);
    onlyInRegistry.sort(byNome);
    mismatched.sort(byNome);
    duplicates.sort(byNome);
    allInvoice.sort(byNome);

    // status de fechamento
    const existingClosure = await this.prisma.conciliacao.findUnique({
      where: { clientId_mesReferencia: { clientId, mesReferencia: start } },
      select: { status: true, totals: true, closedAt: true },
    });

    const declaredTotal =
      existingClosure && typeof (existingClosure.totals as any)?.declaredTotal === 'number'
        ? (existingClosure.totals as any).declaredTotal
        : undefined;

    const closure: ReconciliationPayload['closure'] | undefined =
      existingClosure
        ? {
            status: existingClosure.status === 'FECHADA' ? 'CLOSED' : 'OPEN',
            totalFatura:
              typeof declaredTotal === 'number' ? this.toBRL(declaredTotal) : undefined,
            closedAt: existingClosure.closedAt?.toISOString(),
            notes:
              typeof (existingClosure.totals as any)?.notes === 'string'
                ? (existingClosure.totals as any).notes
                : null,
          }
        : undefined;

    return {
      ok: true,
      clientId,
      mesReferencia: this.toYYYYMM01(ym),
      totals: {
        faturaCount,
        ativosCount: mapAtivos.size,
        onlyInInvoice: onlyInInvoice.length,
        onlyInRegistry: onlyInRegistry.length,
        mismatched: mismatched.length,
        duplicates: duplicates.length,
        okCount,
        faturaSum: this.toBRL(faturaSumNumber),
        okSum: this.toBRL(okSumNum),
        onlyInInvoiceSum: this.toBRL(onlyInInvoiceSumNum),
      },
      filtersApplied: filters,
      tabs: { onlyInInvoice, onlyInRegistry, mismatched, duplicates, allInvoice },
      closure,
    };
  }

  // ---------- export das abas ----------
  async exportReconciliation(
    clientId: string,
    opts: {
      mesReferencia?: Date | string;
      format: 'xlsx' | 'csv';
      tab: 'mismatched' | 'onlyInInvoice' | 'onlyInRegistry' | 'duplicates' | 'all' | 'allInvoice';
      filters?: Filters;
    },
  ): Promise<{ filename: string; contentType: string; buffer: Buffer }> {
    const payload = await this.buildReconciliation(clientId, {
      mesReferencia: opts.mesReferencia,
      filters: opts.filters,
    });
    const yyyymm = payload.mesReferencia.slice(0, 7);

    const sheetNameSuffix = () => {
      const parts: string[] = [];
      if (opts.filters?.tipo) parts.push(`tipo_${opts.filters.tipo}`);
      if (opts.filters?.plano) parts.push(`plano_${opts.filters.plano}`);
      if (opts.filters?.centro) parts.push(`centro_${opts.filters.centro}`);
      return parts.length ? `_${parts.join('-')}` : '';
    };

    const sheets = {
      mismatched: {
        name: 'Divergentes',
        rows: payload.tabs.mismatched.map((r) => ({
          CPF: r.cpf,
          Beneficiario: r.nome,
          Valor_Cobrado: r.valorCobrado,
          Valor_Mensalidade: r.valorMensalidade,
          Diferenca: r.diferenca,
        })),
      },
      onlyInInvoice: {
        name: 'So_na_fatura',
        rows: payload.tabs.onlyInInvoice.map((r) => ({
          CPF: r.cpf,
          Beneficiario: r.nome,
          Valor_Cobrado: r.valorCobrado,
        })),
      },
      onlyInRegistry: {
        name: 'So_no_cadastro',
        rows: payload.tabs.onlyInRegistry.map((r) => ({
          CPF: r.cpf,
          Beneficiario: r.nome,
          Valor_Mensalidade: r.valorMensalidade,
        })),
      },
      duplicates: {
        name: 'Duplicados',
        rows: payload.tabs.duplicates.map((r) => ({
          CPF: r.cpf,
          Beneficiario: r.nome,
          Ocorrencias: r.ocorrencias,
          Soma_Cobrada: r.somaCobrada,
          Valores: r.valores.join(', '),
        })),
      },
      allInvoice: {
        name: 'Fatura_todos',
        rows: payload.tabs.allInvoice.map((r) => ({
          CPF: r.cpf,
          Beneficiario: r.nome,
          Valor_Cobrado: r.valorCobrado,
          Valor_Mensalidade: r.valorMensalidade,
          Diferenca: r.diferenca,
          Status: r.status,
        })),
      },
    };

    if (opts.format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      if (opts.tab === 'all') {
        Object.values(sheets).forEach((s) => {
          const ws = XLSX.utils.json_to_sheet(s.rows);
          XLSX.utils.book_append_sheet(wb, ws, s.name);
        });
      } else {
        const s = sheets[opts.tab as keyof typeof sheets];
        const ws = XLSX.utils.json_to_sheet(s.rows);
        XLSX.utils.book_append_sheet(wb, ws, s.name);
      }
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return {
        filename: `reconciliacao_${clientId}_${yyyymm}${sheetNameSuffix()}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: buf as Buffer,
      };
    }

    if (opts.tab === 'all') throw new Error('CSV não suporta "all" — escolha uma aba específica.');
    const s = sheets[opts.tab as keyof typeof sheets];
    const ws = XLSX.utils.json_to_sheet(s.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, s.name);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'csv' });
    return {
      filename: `reconciliacao_${opts.tab}_${clientId}_${yyyymm}${sheetNameSuffix()}.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: buf as Buffer,
    };
  }

  // ---------- Fechamento manual ----------
  async closeManual(
    clientId: string,
    dto: { mes: string; totalFatura: number; observacoes?: string },
    actorId?: string,
  ) {
    const ym = this.ensureYYYYMM(dto.mes);
    const mesReferencia = this.firstDayUTC(ym);

    // snapshot
    const payload = await this.buildReconciliation(clientId, { mesReferencia: ym });

    const totalsSnapshot: any = {
      ...payload.totals,
      declaredTotal: Number(dto.totalFatura) || 0,
      notes: dto.observacoes ?? null,
    };

    const counts = {
      faturaCount: payload.totals.faturaCount,
      ativosCount: payload.totals.ativosCount,
      mismatched: payload.totals.mismatched,
      duplicates: payload.totals.duplicates,
      onlyInInvoice: payload.totals.onlyInInvoice,
      onlyInRegistry: payload.totals.onlyInRegistry,
      okCount: payload.totals.okCount,
    };

    const conciliacao = await this.prisma.conciliacao.upsert({
      where: { clientId_mesReferencia: { clientId, mesReferencia } },
      create: {
        clientId,
        mesReferencia,
        status: 'FECHADA',
        totals: totalsSnapshot,
        filtros: payload.filtersApplied as any,
        counts: counts as any,
        closedAt: new Date(),
        closedBy: actorId ?? null,
        createdBy: actorId ?? null,
      },
      update: {
        status: 'FECHADA',
        totals: totalsSnapshot,
        filtros: payload.filtersApplied as any,
        counts: counts as any,
        closedAt: new Date(),
        closedBy: actorId ?? undefined,
      },
      select: { id: true, status: true, closedAt: true },
    });

    return { ok: true, conciliacao };
  }

  // ---------- Reabrir mês ----------
  async reopen(
    clientId: string,
    dto: { mes: string },
    _actorId?: string,
  ) {
    const ym = this.ensureYYYYMM(dto.mes);
    const mesReferencia = this.firstDayUTC(ym);

    const conc = await this.prisma.conciliacao.findUnique({
      where: { clientId_mesReferencia: { clientId, mesReferencia } },
      select: { id: true },
    });
    if (!conc) throw new NotFoundException('Fechamento não encontrado para este mês.');

    const updated = await this.prisma.conciliacao.update({
      where: { id: conc.id },
      data: { status: 'ABERTA', closedAt: null, closedBy: null },
      select: { id: true, status: true },
    });

    return { ok: true, conciliacao: updated };
  }

  // ---------- Histórico (lista) ----------
  async listHistory(
    clientId: string,
    opts?: {
      fromYM?: string; // inclusive
      toYM?: string;   // inclusive
      page?: number;
      limit?: number;
      status?: 'OPEN' | 'CLOSED';
      order?: 'asc' | 'desc';
    },
  ): Promise<{
    ok: true;
    clientId: string;
    pagination: { page: number; limit: number; total: number; hasMore: boolean };
    rows: Array<{
      mes: string; // 'YYYY-MM'
      status: 'OPEN' | 'CLOSED';
      closedAt?: string | null;
      totals: {
        declarado?: string;
        fatura?: string;
        ok?: string;
        onlyInInvoice?: string;
      };
      counts: {
        faturaCount: number;
        ativosCount: number;
        mismatched: number;
        duplicates: number;
        onlyInInvoice: number;
        onlyInRegistry: number;
        okCount: number;
      };
      notes?: string | null;
      signedBy?: { id: string; name?: string | null; email?: string | null };
    }>;
    summary: {
      totalDeclarado: string;
      totalFatura: string;
      diferenca: string;
      closedCount: number;
      openCount: number;
    };
  }> {
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts?.limit ?? 24));
    const skip = (page - 1) * limit;

    const where: Prisma.ConciliacaoWhereInput = { clientId };
    // período
    if (opts?.fromYM || opts?.toYM) {
      const gte = opts?.fromYM ? this.firstDayUTC(opts.fromYM) : undefined;
      const lte = opts?.toYM ? this.nextMonthUTC(this.firstDayUTC(opts.toYM)) : undefined;
      where.mesReferencia = {
        ...(gte ? { gte } : {}),
        ...(lte ? { lt: lte } : {}),
      };
    }
    // status
    if (opts?.status) {
      where.status = opts.status === 'CLOSED' ? 'FECHADA' : 'ABERTA';
    }

    const [total, rowsRaw] = await Promise.all([
      this.prisma.conciliacao.count({ where }),
      this.prisma.conciliacao.findMany({
        where,
        orderBy: { mesReferencia: opts?.order === 'asc' ? 'asc' : 'desc' },
        select: {
          mesReferencia: true,
          status: true,
          totals: true,
          counts: true,
          closedAt: true,
          closedBy: true,
        },
        skip,
        take: limit,
      }),
    ]);

    // nomes de quem fechou (se houver)
    const closers = Array.from(new Set(rowsRaw.map(r => r.closedBy).filter(Boolean))) as string[];
    const usersById = closers.length
      ? (await this.prisma.user.findMany({
          where: { id: { in: closers } },
          select: { id: true, name: true, email: true },
        })).reduce<Record<string, { id: string; name?: string | null; email?: string | null }>>(
          (acc, u) => ((acc[u.id] = { id: u.id, name: u.name, email: u.email }), acc),
          {},
        )
      : {};

    let sumDeclarado = 0;
    let sumFatura = 0;
    let closedCount = 0;
    let openCount = 0;

    const rows = rowsRaw.map((r) => {
      const ym = `${r.mesReferencia.getUTCFullYear()}-${String(
        r.mesReferencia.getUTCMonth() + 1,
      ).padStart(2, '0')}`;

      const t = (r.totals ?? {}) as any;
      const c = (r.counts ?? {}) as any;

      const declaradoNum =
        typeof t.declaredTotal === 'number' ? t.declaredTotal : this.toNum(t.declaredTotal);
      const faturaNum = this.toNum(t.faturaSum);

      if (Number.isFinite(declaradoNum)) sumDeclarado += declaradoNum;
      if (Number.isFinite(faturaNum)) sumFatura += faturaNum;

      if (r.status === 'FECHADA') closedCount += 1;
      else openCount += 1;

      // <- aqui garantimos literal type
      const status: 'OPEN' | 'CLOSED' = r.status === 'FECHADA' ? 'CLOSED' : 'OPEN';

      // força strings nos totais (ou undefined)
      const declaradoStr = Number.isFinite(declaradoNum) ? this.toBRL(declaradoNum) : undefined;
      const faturaStr = typeof t.faturaSum === 'string'
        ? t.faturaSum
        : (Number.isFinite(faturaNum) ? this.toBRL(faturaNum) : undefined);
      const okStr = typeof t.okSum === 'string' ? t.okSum : undefined;
      const onlyInvoiceStr = typeof t.onlyInInvoiceSum === 'string' ? t.onlyInInvoiceSum : undefined;

      return {
        mes: ym,
        status,
        closedAt: r.closedAt?.toISOString() ?? null,
        totals: {
          declarado: declaradoStr,
          fatura: faturaStr,
          ok: okStr,
          onlyInInvoice: onlyInvoiceStr,
        },
        counts: {
          faturaCount: c.faturaCount ?? 0,
          ativosCount: c.ativosCount ?? 0,
          mismatched: c.mismatched ?? 0,
          duplicates: c.duplicates ?? 0,
          onlyInInvoice: c.onlyInInvoice ?? 0,
          onlyInRegistry: c.onlyInRegistry ?? 0,
          okCount: c.okCount ?? 0,
        },
        notes: typeof t.notes === 'string' ? t.notes : null,
        signedBy: r.closedBy ? usersById[r.closedBy] : undefined,
      };
    });

    return {
      ok: true,
      clientId,
      pagination: { page, limit, total, hasMore: skip + rows.length < total },
      rows,
      summary: {
        totalDeclarado: this.toBRL(sumDeclarado),
        totalFatura: this.toBRL(sumFatura),
        diferenca: this.toBRL(sumDeclarado - sumFatura),
        closedCount,
        openCount,
      },
    };
  }

  // ---------- Exportar histórico ----------
  async exportHistory(
    clientId: string,
    opts: {
      fromYM?: string;
      toYM?: string;
      status?: 'OPEN' | 'CLOSED';
      format: 'xlsx' | 'csv';
    },
  ): Promise<{ filename: string; contentType: string; buffer: Buffer }> {
    const all = await this.listHistory(clientId, {
      fromYM: opts.fromYM,
      toYM: opts.toYM,
      status: opts.status,
      page: 1,
      limit: 1000,
      order: 'asc',
    });

    const rows = all.rows.map((r) => ({
      Mes: r.mes,
      Status: r.status,
      Declarado: r.totals.declarado ?? '',
      Fatura: r.totals.fatura ?? '',
      Diferenca:
        r.totals.declarado && r.totals.fatura
          ? this.toBRL(this.toNum(r.totals.declarado) - this.toNum(r.totals.fatura))
          : '',
      ItensImportados: r.counts.faturaCount,
      BenefAtivos: r.counts.ativosCount,
      Divergentes: r.counts.mismatched,
      Duplicados: r.counts.duplicates,
      SoNaFatura: r.counts.onlyInInvoice,
      SoNoCadastro: r.counts.onlyInRegistry,
      FechadoEm: r.closedAt ?? '',
      AssinadoPor: r.signedBy?.name ?? r.signedBy?.email ?? '',
      Observacoes: r.notes ?? '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Faturamento');

    if (opts.format === 'xlsx') {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      return {
        filename: `faturamento_${clientId}_${opts.fromYM ?? ''}_${opts.toYM ?? ''}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: buf as Buffer,
      };
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'csv' });
    return {
      filename: `faturamento_${clientId}_${opts.fromYM ?? ''}_${opts.toYM ?? ''}.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: buf as Buffer,
    };
  }
}
