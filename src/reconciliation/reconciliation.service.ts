/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, RegimeCobranca } from '@prisma/client';
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

// === regras de seguradora ===
type PolicyJson = {
  rounding?: { mode?: 'NEAREST'|'UP'|'DOWN'; precision?: number };
  prorate?: { enabled?: boolean; basis?: 'CALENDAR_DAYS'|'30/360'; minDays?: number };
  minCharge?: number | null;
  maxCharge?: number | null;
  fees?: Array<
    | { type: 'FIXED'; amount: number; when?: 'BEFORE_ROUND' | 'AFTER_ROUND' }
    | { type: 'PERCENT'; rate: number; base?: 'GROSS'|'AFTER_PRORATE_BEFORE_FEES'; when?: 'BEFORE_ROUND'|'AFTER_ROUND' }
  >;
};

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- constantes de comparação ----------
  /** comparação monetária em centavos (<= 1 centavo é OK) */
  private readonly EPSILON_CENTS = 1;
  /** “Grace period” (dias) para início do mês seguinte */
  private readonly DEFAULT_GRACE_DAYS = 0;

  // ---------- helpers de data ----------
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
  private addDaysUTC(d: Date, days: number) {
    return new Date(d.getTime() + days * 86400000);
  }

  // ---------- helpers monetários (centavos) ----------
  /** Converte valores diversos (string “pt-BR”, “en-US”, número) para CENTAVOS inteiros */
  private toCents(v: unknown): number {
    if (v == null) return 0;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return 0;
      return Math.round(v * 100);
    }
    const original = String(v).trim();
    if (!original) return 0;
    const raw = original.replace(/[^\d.,\-]/g, '');
    let n: number;
    if (raw.includes(',')) n = Number(raw.replace(/\./g, '').replace(',', '.'));
    else if (raw.includes('.')) n = Number(raw);
    else {
      const asInt = Number(raw);
      n = Number.isInteger(asInt) && raw.length >= 3 ? asInt / 100 : asInt;
    }
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  /** Converte centavos => string BRL */
  private centsToBRL(cents: number) {
    const n = (cents || 0) / 100;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /** Função legacy (mantida para pontos que ainda usam número) */
  private toNum(v: unknown): number {
    return this.toCents(v) / 100;
  }
  private toBRL(n: number) {
    return this.centsToBRL(Math.round(n * 100));
  }

  /** Normaliza CPF para 11 dígitos e ignora CPFs zerados */
  private normalizeCpf(v?: string | null): string {
    const digits = (v ?? '').replace(/\D/g, '');
    if (!digits) return '';
    const d =
      digits.length === 11 ? digits : digits.length < 11 ? digits.padStart(11, '0') : digits.slice(0, 11);
    if (/^0{11}$/.test(d)) return '';
    return d;
  }

  private maskCpf(cpf: string) {
    const d = this.normalizeCpf(cpf) || '•'.repeat(11);
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  }

  /**
   * Dias de "tolerância" para incluir beneficiários cuja data de entrada
   * cai logo no começo do mês seguinte à competência da fatura (ex.: operadora antecipa cobrança).
   * Pode futuramente vir de configuração por seguradora/cliente.
   */
  private getStartGraceDays(_insurerId?: string): number {
    return this.DEFAULT_GRACE_DAYS;
  }

  private makeBenefWhereVigente(
    clientId: string,
    filters: Filters,
    startInclusive: Date,
    endExclusiveWithGrace: Date,
  ) {
    const where: Prisma.BeneficiarioWhereInput = {
      clientId,
      status: 'ATIVO',
      dataEntrada: { lt: endExclusiveWithGrace }, // entrou antes do limite (1º do próximo mês + grace)
      OR: [{ dataSaida: null }, { dataSaida: { gte: startInclusive } }], // não saiu ou saiu depois do início
    };
    if (filters?.tipo) (where as any).tipo = filters.tipo;
    if (filters?.plano) (where as any).plano = filters.plano;
    if (filters?.centro) (where as any).centroCusto = filters.centro;
    return where;
  }

  // === regras de seguradora ===
  private async loadActiveRules(insurerId: string, clientId: string, start: Date, end: Date) {
    return this.prisma.insurerBillingRule.findMany({
      where: {
        insurerId,
        isActive: true,
        validFrom: { lte: end },
        OR: [{ validTo: null }, { validTo: { gt: start } }],
      },
      orderBy: [{ validFrom: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true, insurerId: true, clientId: true, planId: true, faixaEtaria: true, regime: true, policy: true, validFrom: true, validTo: true,
      },
    });
  }

  private pickBestRule(
    rules: Array<any>,
    ctx: { clientId: string; planId?: string; faixaEtaria?: string | null; regime?: RegimeCobranca | null },
  ) {
    let best: any | undefined;
    let bestScore = -1;
    for (const r of rules) {
      let score = 0;
      if (r.clientId && r.clientId === ctx.clientId) score += 8;
      if (r.planId && r.planId === ctx.planId) score += 4;
      if (r.faixaEtaria && r.faixaEtaria === (ctx.faixaEtaria ?? undefined)) score += 2;
      if (r.regime && r.regime === (ctx.regime ?? undefined)) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best;
  }

  private daysBetween(start: Date, end: Date) {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  }

  private applyPolicy(
    base: number,
    ben: { dataEntrada?: Date | null; dataSaida?: Date | null; regimeCobranca?: RegimeCobranca | null },
    monthStart: Date,
    monthEnd: Date,
    policy: PolicyJson,
  ): number {
    if (!Number.isFinite(base)) return 0;

    let amount = base;

    // pró-rata
    const needProrate = policy?.prorate?.enabled || ben.regimeCobranca === 'DIARIO';
    if (needProrate) {
      const covStart = new Date(Math.max((ben.dataEntrada?.getTime() ?? -Infinity), monthStart.getTime()));
      const covEnd = new Date(
        Math.min(((ben.dataSaida ? new Date(ben.dataSaida.getTime() + 86400000) : monthEnd).getTime()), monthEnd.getTime()),
      ); // end exclusivo
      const coveredDays = Math.max(0, this.daysBetween(covStart, covEnd));
      const basis = policy?.prorate?.basis === '30/360' ? 30 : this.daysBetween(monthStart, monthEnd);
      const minDays = policy?.prorate?.minDays ?? 0;

      const daily = base / (basis || 30);
      const chargeableDays = Math.max(coveredDays, minDays);
      amount = daily * chargeableDays;
    }

    // fees BEFORE_ROUND
    for (const f of policy?.fees ?? []) {
      if ((f as any).when && (f as any).when !== 'BEFORE_ROUND') continue;
      if (f.type === 'FIXED') amount += f.amount;
      if (f.type === 'PERCENT') {
        const baseRef = (f as any).base === 'GROSS' ? base : amount;
        amount += baseRef * f.rate;
      }
    }

    // arredondamento
    const mode = policy?.rounding?.mode ?? 'NEAREST';
    const prec = Math.max(0, policy?.rounding?.precision ?? 2);
    const factor = Math.pow(10, prec);
    if (mode === 'UP') amount = Math.ceil(amount * factor) / factor;
    else if (mode === 'DOWN') amount = Math.floor(amount * factor) / factor;
    else amount = Math.round(amount * factor) / factor;

    // fees AFTER_ROUND
    for (const f of policy?.fees ?? []) {
      if ((f as any).when === 'AFTER_ROUND') {
        if (f.type === 'FIXED') amount += f.amount;
        if (f.type === 'PERCENT') amount += amount * f.rate;
      }
    }

    // limites
    if (typeof policy?.minCharge === 'number') amount = Math.max(amount, policy!.minCharge!);
    if (typeof policy?.maxCharge === 'number') amount = Math.min(amount, policy!.maxCharge!);

    return amount;
  }

  private async resolvePlanIdByNameCached(
    cache: Map<string, string | null>,
    insurerId: string,
    planName?: string | null,
  ): Promise<string | undefined> {
    const key = `${insurerId}::${(planName || '').trim().toLowerCase()}`;
    if (!planName || !key.trim()) return undefined;
    if (cache.has(key)) return cache.get(key) || undefined;

    const plan = await this.prisma.healthPlan.findFirst({
      where: {
        insurerId,
        OR: [
          { name: { equals: planName, mode: 'insensitive' } },
          { aliases: { some: { alias: { equals: planName, mode: 'insensitive' } } } },
        ],
      },
      select: { id: true },
    });
    cache.set(key, plan ? plan.id : null);
    return plan?.id;
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
    opts?: { mesReferencia?: Date | string; filters?: Filters; insurerId?: string },
  ): Promise<ReconciliationPayload> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    const ym = this.ensureYYYYMM(opts?.mesReferencia);
    const firstDayStr = this.toYYYYMM01(ym);
    const start = this.firstDayUTC(ym);
    const next = this.nextMonthUTC(start);
    const filters = opts?.filters ?? {};
    const anyFilter = !!(filters.tipo || filters.plano || filters.centro);
    const insurerId = opts?.insurerId ?? undefined;

    // aplica "grace" para considerar entradas no comecinho do mês seguinte (ex.: 02/10)
    const endBound = this.addDaysUTC(next, this.getStartGraceDays(insurerId));

    // 1) tenta itens (filtra por insurerId)
    let rows = await this.prisma.$queryRaw<FaturaRow[]>(Prisma.sql`
      SELECT i."id", i."nomeCompleto", i."cpf", i."valorPlano"
      FROM "health_imported_invoice_items" i
      JOIN "health_imported_invoices" f ON f."id" = i."faturaId"
      WHERE f."clientId" = ${clientId}
        AND f."mesReferencia" >= ${firstDayStr}::date
        AND f."mesReferencia" < (${firstDayStr}::date + INTERVAL '1 month')
        ${insurerId
          ? Prisma.sql`AND f."insurerId" = ${insurerId}`
          : Prisma.sql`AND f."insurerId" IS NULL`}
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
          ${insurerId
            ? Prisma.sql`AND f."insurerId" = ${insurerId}`
            : Prisma.sql`AND f."insurerId" IS NULL`}
      `);
    }

    // normalização de fatura (mantém centavos para cálculos)
    const flatFatura = rows
      .map((r) => {
        const cpf = this.normalizeCpf(r.cpf);
        if (!cpf) return null;
        return {
          id: r.id,
          cpf,
          nome: r.nomeCompleto ?? '',
          valorCents: this.toCents(r.valorPlano),
        };
      })
      .filter(Boolean) as Array<{ id: string; cpf: string; nome: string; valorCents: number }>;

    const faturaCount = flatFatura.length;
    const faturaSumCents = flatFatura.reduce((acc, r) => acc + r.valorCents, 0);

    // SET de CPFs da fatura
    const faturaCpfsToMatch = Array.from(new Set(flatFatura.map((r) => r.cpf)));

    // guard: se não tiver CPF, retorna payload vazio coerente (evita IN () inválido)
    if (faturaCpfsToMatch.length === 0) {
      return {
        ok: true,
        clientId,
        mesReferencia: this.toYYYYMM01(ym),
        totals: {
          faturaCount: 0,
          ativosCount: 0,
          onlyInInvoice: 0,
          onlyInRegistry: 0,
          mismatched: 0,
          duplicates: 0,
          okCount: 0,
          faturaSum: this.centsToBRL(0),
          okSum: this.centsToBRL(0),
          onlyInInvoiceSum: this.centsToBRL(0),
        },
        filtersApplied: filters,
        tabs: { onlyInInvoice: [], onlyInRegistry: [], mismatched: [], duplicates: [], allInvoice: [] },
        closure: undefined,
      };
    }

    // Beneficiários vigentes via Prisma usando cpfNormalized (indexado)
      const ativos = await this.prisma.beneficiario.findMany({
        where: {
          ...this.makeBenefWhereVigente(clientId, filters, start, endBound),
          cpfNormalized: { in: Array.from(faturaCpfsToMatch) }
        },
      select: {
        id: true,
        nomeCompleto: true,
        cpf: true,
        cpfNormalized: true,
        valorMensalidade: true,
        plano: true,
        faixaEtaria: true,
        regimeCobranca: true,
        dataEntrada: true,
        dataSaida: true,
      },
    });

    // --- regras/ajustes ---
    const rules = insurerId ? await this.loadActiveRules(insurerId, clientId, start, next) : [];
    const planCache = new Map<string, string | null>();

    // Mapa de ativos por CPF com mensalidade base e ajustada (centavos ao final)
    const mapAtivos = new Map<string, { nome: string; mensalidadeCents: number; adjustedCents: number }>();
    for (const b of ativos) {
      const cpf = b.cpfNormalized ?? this.normalizeCpf(b.cpf);
      if (!cpf) continue;

      const baseMensNum = this.toNum(b.valorMensalidade as any);

      const planId = insurerId ? await this.resolvePlanIdByNameCached(planCache, insurerId, b.plano) : undefined;
      const rule = insurerId
        ? this.pickBestRule(rules, {
            clientId,
            planId,
            faixaEtaria: b.faixaEtaria ?? undefined,
            regime: b.regimeCobranca ?? undefined,
          })
        : undefined;

      const adjustedNum = rule
        ? this.applyPolicy(
            baseMensNum,
            { dataEntrada: b.dataEntrada, dataSaida: b.dataSaida, regimeCobranca: b.regimeCobranca ?? null },
            start,
            next,
            (rule.policy as any) as PolicyJson,
          )
        : baseMensNum;

      mapAtivos.set(cpf, {
        nome: b.nomeCompleto ?? '',
        mensalidadeCents: Math.round(baseMensNum * 100),
        adjustedCents: Math.round(adjustedNum * 100),
      });
    }

    // agrega a fatura por CPF (centavos)
    const byCpf = new Map<string, { nome: string; somaCents: number; valoresCents: number[]; ids: string[] }>();
    for (const r of flatFatura) {
      const cur = byCpf.get(r.cpf) ?? { nome: r.nome, somaCents: 0, valoresCents: [], ids: [] };
      cur.nome = cur.nome || r.nome;
      cur.somaCents += r.valorCents;
      cur.valoresCents.push(r.valorCents);
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
    let onlyInInvoiceSumCents = 0;
    let okSumCents = 0;
    let okCount = 0;

    // cruza fatura x cadastro
    for (const [cpf, info] of byCpf.entries()) {
      const beneficiarioMatched = mapAtivos.get(cpf);

      if (!beneficiarioMatched) {
        if (!anyFilter) {
          onlyInInvoice.push({
            id: info.ids[0] ?? `INV:${cpf}`,
            cpf: this.maskCpf(cpf),
            nome: info.nome || '—',
            valorCobrado: this.centsToBRL(info.somaCents),
          });
          onlyInInvoiceSumCents += info.somaCents;
        }
        continue;
      }

      if (info.valoresCents.length > 1) {
        duplicates.push({
          id: info.ids[0] ?? `DUP:${cpf}`,
          cpf: this.maskCpf(cpf),
          nome: beneficiarioMatched.nome || info.nome || '—',
          ocorrencias: info.valoresCents.length,
          somaCobrada: this.centsToBRL(info.somaCents),
          valores: info.valoresCents.map((v) => this.centsToBRL(v)),
        });
      }

      const esperadoCents = insurerId ? beneficiarioMatched.adjustedCents : beneficiarioMatched.mensalidadeCents;
      const diffAbsCents = Math.abs(info.somaCents - esperadoCents);

      if (diffAbsCents > this.EPSILON_CENTS) {
        mismatched.push({
          id: info.ids[0] ?? `MIS:${cpf}`,
          cpf: this.maskCpf(cpf),
          nome: beneficiarioMatched.nome || info.nome || '—',
          valorCobrado: this.centsToBRL(info.somaCents),
          valorMensalidade: this.centsToBRL(esperadoCents),
          diferenca: this.centsToBRL(info.somaCents - esperadoCents),
        });
      } else {
        okSumCents += info.somaCents;
        okCount += 1;
      }
    }

    // Só no cadastro (vigente) — mas não veio na fatura
    for (const [cpf, ativo] of mapAtivos.entries()) {
      if (!byCpf.has(cpf)) {
        const esperadoCents = insurerId ? ativo.adjustedCents : ativo.mensalidadeCents;
        onlyInRegistry.push({
          id: `REG:${cpf}`,
          cpf: this.maskCpf(cpf),
          nome: ativo.nome || '—',
          valorMensalidade: this.centsToBRL(esperadoCents),
        });
      }
    }

    // Monta a visão "Fatura (todos)"
    for (const r of flatFatura) {
      const ativo = mapAtivos.get(r.cpf);
      const mensalCents = ativo ? (insurerId ? ativo.adjustedCents : ativo.mensalidadeCents) : NaN;
      const diffCents = ativo ? r.valorCents - (mensalCents as number) : NaN;

      const status: 'OK' | 'DIVERGENTE' | 'DUPLICADO' | 'SOFATURA' =
        !ativo
          ? 'SOFATURA'
          : (byCpf.get(r.cpf)?.valoresCents.length ?? 0) > 1
          ? 'DUPLICADO'
          : Math.abs(diffCents as number) > this.EPSILON_CENTS
          ? 'DIVERGENTE'
          : 'OK';

      allInvoice.push({
        id: r.id,
        cpf: this.maskCpf(r.cpf),
        nome: (ativo?.nome || r.nome || '—') as string,
        valorCobrado: this.centsToBRL(r.valorCents),
        valorMensalidade: ativo ? this.centsToBRL(mensalCents as number) : '—',
        diferenca: ativo ? this.centsToBRL(diffCents as number) : '—',
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

    // status de fechamento — sensível a insurerId (opcional)
    const existingClosure = await this.prisma.conciliacao.findFirst({
      where: {
        clientId,
        mesReferencia: start,
        ...(insurerId ? { insurerId } : { insurerId: null }),
      },
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
            totalFatura: typeof declaredTotal === 'number' ? this.centsToBRL(Math.round(declaredTotal * 100)) : undefined,
            closedAt: existingClosure.closedAt?.toISOString(),
            notes: typeof (existingClosure.totals as any)?.notes === 'string' ? (existingClosure.totals as any).notes : null,
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
        faturaSum: this.centsToBRL(faturaSumCents),
        okSum: this.centsToBRL(okSumCents),
        onlyInInvoiceSum: this.centsToBRL(onlyInInvoiceSumCents),
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
      insurerId?: string;
    },
  ): Promise<{ filename: string; contentType: string; buffer: Buffer }> {
    const payload = await this.buildReconciliation(clientId, {
      mesReferencia: opts.mesReferencia,
      filters: opts.filters,
      insurerId: opts.insurerId,
    });
    const yyyymm = payload.mesReferencia.slice(0, 7);

    const sheetNameSuffix = () => {
      const parts: string[] = [];
      if (opts.insurerId) parts.push(`seg_${opts.insurerId}`);
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
    dto: { mes: string; totalFatura: number; observacoes?: string; insurerId?: string },
    actorId?: string,
  ) {
    const ym = this.ensureYYYYMM(dto.mes);
    const mesReferencia = this.firstDayUTC(ym);
    const insurerId = dto.insurerId ?? undefined;

    // snapshot (sensível a insurerId)
    const payload = await this.buildReconciliation(clientId, { mesReferencia: ym, insurerId });

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

    const existing = await this.prisma.conciliacao.findFirst({
      where: {
        clientId,
        mesReferencia,
        ...(insurerId ? { insurerId } : { insurerId: null }),
      },
      select: { id: true },
    });

    let conciliacao;
    if (!existing) {
      conciliacao = await this.prisma.conciliacao.create({
        data: {
          clientId,
          mesReferencia,
          insurerId: insurerId ?? null,
          status: 'FECHADA',
          totals: totalsSnapshot,
          filtros: payload.filtersApplied as any,
          counts: counts as any,
          closedAt: new Date(),
          closedBy: actorId ?? null,
          createdBy: actorId ?? null,
        },
        select: { id: true, status: true, closedAt: true },
      });
    } else {
      conciliacao = await this.prisma.conciliacao.update({
        where: { id: existing.id },
        data: {
          status: 'FECHADA',
          totals: totalsSnapshot,
          filtros: payload.filtersApplied as any,
          counts: counts as any,
          closedAt: new Date(),
          closedBy: actorId ?? undefined,
        },
        select: { id: true, status: true, closedAt: true },
      });
    }

    return { ok: true, conciliacao };
  }

  // ---------- Reabrir mês ----------
  async reopen(clientId: string, dto: { mes: string; insurerId?: string }, _actorId?: string) {
    const ym = this.ensureYYYYMM(dto.mes);
    const mesReferencia = this.firstDayUTC(ym);
    const insurerId = dto.insurerId ?? undefined;

    const conc = await this.prisma.conciliacao.findFirst({
      where: {
        clientId,
        mesReferencia,
        ...(insurerId ? { insurerId } : { insurerId: null }),
      },
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
      toYM?: string; // inclusive
      page?: number;
      limit?: number;
      status?: 'OPEN' | 'CLOSED';
      order?: 'asc' | 'desc';
      insurerId?: string;
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

    const where: Prisma.ConciliacaoWhereInput = {
      clientId,
      ...(opts?.insurerId ? { insurerId: opts.insurerId } : {}),
    };
    if (opts?.fromYM || opts?.toYM) {
      const gte = opts?.fromYM ? this.firstDayUTC(opts.fromYM) : undefined;
      const lte = opts?.toYM ? this.nextMonthUTC(this.firstDayUTC(opts.toYM)) : undefined;
      where.mesReferencia = {
        ...(gte ? { gte } : {}),
        ...(lte ? { lt: lte } : {}),
      };
    }
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

    const closers = Array.from(new Set(rowsRaw.map((r) => r.closedBy).filter(Boolean))) as string[];
    const usersById = closers.length
      ? (
          await this.prisma.user.findMany({
            where: { id: { in: closers } },
            select: { id: true, name: true, email: true },
          })
        ).reduce<Record<string, { id: string; name?: string | null; email?: string | null }>>(
          (acc, u) => ((acc[u.id] = { id: u.id, name: u.name, email: u.email }), acc),
          {},
        )
      : {};

    let sumDeclaradoCents = 0;
    let sumFaturaCents = 0;
    let closedCount = 0;
    let openCount = 0;

    const rows = rowsRaw.map((r) => {
      const ym = `${r.mesReferencia.getUTCFullYear()}-${String(r.mesReferencia.getUTCMonth() + 1).padStart(2, '0')}`;

      const t = (r.totals ?? {}) as any;
      const c = (r.counts ?? {}) as any;

      // Totais podem ter sido salvos como número ou string formatada — converto com robustez:
      const declaradoCents =
        typeof t.declaredTotal === 'number' ? Math.round(t.declaredTotal * 100) : this.toCents(t.declaredTotal);
      const faturaCents =
        typeof t.faturaSum === 'string' ? this.toCents(t.faturaSum) : Math.round((t.faturaSum ?? 0) * 100);

      if (Number.isFinite(declaradoCents)) sumDeclaradoCents += declaradoCents;
      if (Number.isFinite(faturaCents)) sumFaturaCents += faturaCents;

      if (r.status === 'FECHADA') closedCount += 1;
      else openCount += 1;

      const status: 'OPEN' | 'CLOSED' = r.status === 'FECHADA' ? 'CLOSED' : 'OPEN';

      const declaradoStr = Number.isFinite(declaradoCents) ? this.centsToBRL(declaradoCents) : undefined;
      const faturaStr = Number.isFinite(faturaCents) ? this.centsToBRL(faturaCents) : undefined;
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
        totalDeclarado: this.centsToBRL(sumDeclaradoCents),
        totalFatura: this.centsToBRL(sumFaturaCents),
        diferenca: this.centsToBRL(sumDeclaradoCents - sumFaturaCents),
        closedCount,
        openCount,
      },
    };
  }

  // ---------- Exportar histórico ----------
  async exportHistory(
    clientId: string,
    opts: { fromYM?: string; toYM?: string; status?: 'OPEN' | 'CLOSED'; format: 'xlsx' | 'csv'; insurerId?: string },
  ): Promise<{ filename: string; contentType: string; buffer: Buffer }> {
    const all = await this.listHistory(clientId, {
      fromYM: opts.fromYM,
      toYM: opts.toYM,
      status: opts.status,
      page: 1,
      limit: 1000,
      order: 'asc',
      insurerId: opts.insurerId,
    });

    const rows = all.rows.map((r) => ({
      Mes: r.mes,
      Status: r.status,
      Declarado: r.totals.declarado ?? '',
      Fatura: r.totals.fatura ?? '',
      Diferenca:
        r.totals.declarado && r.totals.fatura
          ? this.centsToBRL(this.toCents(r.totals.declarado) - this.toCents(r.totals.fatura))
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
        filename: `faturamento_${clientId}_${opts.fromYM ?? ''}_${opts.toYM ?? ''}${opts.insurerId ? `_seg_${opts.insurerId}` : ''}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: buf as Buffer,
      };
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'csv' });
    return {
      filename: `faturamento_${clientId}_${opts.fromYM ?? ''}_${opts.toYM ?? ''}${opts.insurerId ? `_seg_${opts.insurerId}` : ''}.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: buf as Buffer,
    };
  }
}
