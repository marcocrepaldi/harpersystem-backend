import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';

// ---------- Tipos ----------
type ReconTabs = {
  onlyInInvoice: Array<{ id: string; cpf: string; nome: string; valorCobrado: string }>;
  onlyInRegistry: Array<{ id: string; cpf: string; nome: string; valorMensalidade: string }>;
  mismatched: Array<{ id: string; cpf: string; nome: string; valorCobrado: string; valorMensalidade: string; diferenca: string }>;
  duplicates: Array<{ id: string; cpf: string; nome: string; ocorrencias: number; somaCobrada: string; valores: string[] }>;
  /** NOVO: itens OK (convergentes) */
  matched: Array<{ id: string; cpf: string; nome: string; valorCobrado: string; valorMensalidade: string; diferenca: string; status: 'OK' }>;
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
    faturaSum: string;
    ativosCount: number;
    onlyInInvoice: number;
    onlyInRegistry: number;
    mismatched: number;
    duplicates: number;
    /** NOVO: total de convergentes */
    matched: number;
  };
  filtersApplied: Filters;
  tabs: ReconTabs;
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

  // ---------- Helpers de data/num ----------
  private ensureYYYYMM(mes?: string): string {
    if (mes && /^\d{4}-\d{2}$/.test(mes)) return mes;
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  private fromDateToYYYYMM(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
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
  /** Converte Decimal/number/string para number */
  private toNum(v: unknown) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    // Prisma.Decimal tem .toNumber()
    if (typeof v === 'object' && v !== null && 'toNumber' in (v as any)) {
      try {
        return (v as any).toNumber();
      } catch {
        /* fallthrough */
      }
    }
    const s = String(v).replace(/\./g, '').replace(',', '.'); // tolera pt-BR
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  private toBRL(n: number) {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  private maskCpf(cpf: string) {
    const d = (cpf || '').replace(/\D/g, '').padStart(11, '•');
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  }

  // Beneficiários **vigentes no mês** (entrou antes do mês seguinte e não saiu antes do 1º dia)
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

  // ---------- Opções para filtros ----------
  async getFilterOptions(clientId: string) {
    // Opcionalmente podemos filtrar por mês de referência; por ora mantém ATIVO sem dataSaida.
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

  // ---------- Conciliação ----------
  async buildReconciliation(
    clientId: string,
    opts?: { mesReferencia?: Date | string; filters?: Filters },
  ): Promise<ReconciliationPayload> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    // aceita Date ou string YYYY-MM; default: mês atual (UTC)
    const ym =
      typeof opts?.mesReferencia === 'string'
        ? this.ensureYYYYMM(opts.mesReferencia)
        : opts?.mesReferencia instanceof Date
        ? this.fromDateToYYYYMM(opts.mesReferencia)
        : this.ensureYYYYMM();

    const firstDayStr = this.toYYYYMM01(ym); // para SQL
    const start = this.firstDayUTC(ym);
    const next = this.nextMonthUTC(start);
    const filters = opts?.filters ?? {};
    const anyFilter = !!(filters.tipo || filters.plano || filters.centro);

    // 1) tenta ITENS da fatura
    let rows = await this.prisma.$queryRaw<FaturaRow[]>(Prisma.sql`
      SELECT i."id", i."nomeCompleto", i."cpf", i."valorPlano"
      FROM "health_imported_invoice_items" i
      JOIN "health_imported_invoices" f ON f."id" = i."faturaId"
      WHERE f."clientId" = ${clientId}
        AND f."mesReferencia" >= ${firstDayStr}::date
        AND f."mesReferencia" < (${firstDayStr}::date + INTERVAL '1 month')
    `);

    // 2) fallback: cabeçalho (1 linha/beneficiário)
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

    // ✅ Beneficiários **vigentes** no mês de referência
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

    const byCpf = new Map<string, { nome: string; soma: number; valores: number[]; ids: string[] }>();
    for (const r of flatFatura) {
      const cur = byCpf.get(r.cpf) ?? { nome: r.nome, soma: 0, valores: [], ids: [] };
      cur.nome = cur.nome || r.nome;
      cur.soma += r.valor;
      cur.valores.push(r.valor);
      cur.ids.push(r.id);
      byCpf.set(r.cpf, cur);
    }

    const onlyInInvoice: ReconTabs['onlyInInvoice'] = [];
    const onlyInRegistry: ReconTabs['onlyInRegistry'] = [];
    const mismatched: ReconTabs['mismatched'] = [];
    const duplicates: ReconTabs['duplicates'] = [];
    const allInvoice: ReconTabs['allInvoice'] = [];

    // Divergências / Duplicados / Só na fatura
    for (const [cpf, info] of byCpf.entries()) {
      const ativo = mapAtivos.get(cpf);
      if (!ativo) {
        // Só acrescenta "só na fatura" quando não há filtro — comportamento atual da UI
        if (!anyFilter) {
          onlyInInvoice.push({
            id: info.ids[0] ?? `INV:${cpf}`,
            cpf: this.maskCpf(cpf),
            nome: info.nome || '—',
            valorCobrado: this.toBRL(info.soma),
          });
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

    // Fatura (todos) + status
    for (const r of flatFatura) {
      if (anyFilter && !ativosSet.has(r.cpf)) continue; // se filtra por (tipo/plano/centro), mostra apenas os vigentes filtrados

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

    // NOVO: Convergentes (OK) derivados de allInvoice
    const matched: ReconTabs['matched'] = allInvoice
      .filter((r) => r.status === 'OK')
      .map((r) => ({
        id: r.id,
        cpf: r.cpf,
        nome: r.nome,
        valorCobrado: r.valorCobrado,
        valorMensalidade: r.valorMensalidade,
        diferenca: r.diferenca,
        status: 'OK' as const,
      }));

    // Ordenações por nome para consistência com UI
    const byNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome);
    onlyInInvoice.sort(byNome);
    onlyInRegistry.sort(byNome);
    mismatched.sort(byNome);
    duplicates.sort(byNome);
    allInvoice.sort(byNome);
    matched.sort(byNome);

    return {
      ok: true,
      clientId,
      mesReferencia: this.toYYYYMM01(ym),
      totals: {
        faturaCount,
        faturaSum: this.toBRL(faturaSumNumber),
        ativosCount: mapAtivos.size,
        onlyInInvoice: onlyInInvoice.length,
        onlyInRegistry: onlyInRegistry.length,
        mismatched: mismatched.length,
        duplicates: duplicates.length,
        matched: matched.length,
      },
      filtersApplied: filters,
      tabs: { onlyInInvoice, onlyInRegistry, mismatched, duplicates, matched, allInvoice },
    };
  }

  // ---------- Export ----------
  async exportReconciliation(
    clientId: string,
    opts: {
      mesReferencia?: Date | string;
      format: 'xlsx' | 'csv';
      tab: 'mismatched' | 'onlyInInvoice' | 'onlyInRegistry' | 'duplicates' | 'matched' | 'all' | 'allInvoice';
      filters?: Filters;
    },
  ): Promise<{ filename: string; contentType: string; buffer: Buffer }> {
    const payload = await this.buildReconciliation(clientId, {
      mesReferencia:
        typeof opts.mesReferencia === 'string'
          ? opts.mesReferencia
          : opts.mesReferencia instanceof Date
          ? opts.mesReferencia
          : undefined,
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
      matched: {
        name: 'Convergentes',
        rows: payload.tabs.matched.map((r) => ({
          CPF: r.cpf,
          Beneficiario: r.nome,
          Valor_Cobrado: r.valorCobrado,
          Valor_Mensalidade: r.valorMensalidade,
          Diferenca: r.diferenca,
          Status: r.status,
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

    if (opts.tab === 'all') {
      throw new Error('CSV não suporta "all" — escolha uma aba específica.');
    }
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
}
