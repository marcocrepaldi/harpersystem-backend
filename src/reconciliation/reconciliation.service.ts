import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

type ReconTabs = {
  onlyInInvoice: Array<{ cpf: string; nome: string; valorCobrado: string }>;
  onlyInRegistry: Array<{ cpf: string; nome: string; valorMensalidade: string }>;
  mismatched: Array<{ cpf: string; nome: string; valorCobrado: string; valorMensalidade: string; diferenca: string }>;
  duplicates: Array<{ cpf: string; nome: string; ocorrencias: number; somaCobrada: string; valores: string[] }>;
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
  };
  filtersApplied: Filters;
  tabs: ReconTabs;
};

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  // Opções para filtros (distintos do cadastro ativo do cliente; sem mês)
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
      planos: planos.map(p => p.plano).filter(Boolean) as string[],
      centros: centros.map(c => c.centroCusto).filter(Boolean) as string[],
    };
  }

  private currentMonthUTC(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }
  private formatYYYYMM01(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }

  private makeBenefWhere(clientId: string, filters?: Filters) {
    const where: any = { clientId, status: 'ATIVO', dataSaida: null };
    if (filters?.tipo) where.tipo = filters.tipo; // TITULAR|DEPENDENTE
    if (filters?.plano) where.plano = filters.plano; // equals (exato) — pode trocar para contains se quiser
    if (filters?.centro) where.centroCusto = filters.centro;
    return where;
  }

  async buildReconciliation(
    clientId: string,
    opts?: { mesReferencia?: Date; filters?: Filters },
  ): Promise<ReconciliationPayload> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    const mesReferencia = opts?.mesReferencia ?? this.currentMonthUTC();
    const mesStr = this.formatYYYYMM01(mesReferencia);
    const filters = opts?.filters ?? {};

    // 1) Fatura importada do mês (não tem plano/centro, filtraremos apenas pelo lado do cadastro)
    const [faturaItems, faturaCount, faturaAgg] = await this.prisma.$transaction([
      this.prisma.faturaImportada.findMany({
        where: { clientId, mesReferencia },
        select: {
          nomeBeneficiarioOperadora: true,
          cpfBeneficiarioOperadora: true,
          valorCobradoOperadora: true,
        },
      }),
      this.prisma.faturaImportada.count({ where: { clientId, mesReferencia } }),
      this.prisma.faturaImportada.aggregate({
        where: { clientId, mesReferencia },
        _sum: { valorCobradoOperadora: true },
      }),
    ]);

    // 2) Beneficiários ATIVOS filtrados
    const ativos = await this.prisma.beneficiario.findMany({
      where: this.makeBenefWhere(clientId, filters),
      select: { id: true, nomeCompleto: true, cpf: true, valorMensalidade: true },
    });

    // Helpers
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
    const toNumber = (v: any) => Number(v || 0);
    const toBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Índice por CPF (apenas dos ativos filtrados!)
    const mapAtivos = new Map<string, { nome: string; mensalidade: number }>();
    for (const b of ativos) {
      const cpf = clean(b.cpf);
      if (!cpf) continue;
      mapAtivos.set(cpf, { nome: b.nomeCompleto ?? '', mensalidade: toNumber(b.valorMensalidade) });
    }

    // Agrupa fatura por CPF
    const mapFatura = new Map<string, { nome: string; soma: number; valores: number[] }>();
    for (const it of faturaItems) {
      const cpf = clean(it.cpfBeneficiarioOperadora);
      if (!cpf) continue;
      const valor = toNumber(it.valorCobradoOperadora);
      const nome = it.nomeBeneficiarioOperadora ?? '';
      const cur = mapFatura.get(cpf) ?? { nome, soma: 0, valores: [] };
      cur.nome = cur.nome || nome;
      cur.soma += valor;
      cur.valores.push(valor);
      mapFatura.set(cpf, cur);
    }

    // Saídas
    const onlyInInvoice: Array<{ cpf: string; nome: string; valorCobrado: string }> = [];
    const onlyInRegistry: Array<{ cpf: string; nome: string; valorMensalidade: string }> = [];
    const mismatched: Array<{ cpf: string; nome: string; valorCobrado: string; valorMensalidade: string; diferenca: string }> = [];
    const duplicates: Array<{ cpf: string; nome: string; ocorrencias: number; somaCobrada: string; valores: string[] }> = [];

    // Regras: filtros se aplicam ao CADASTRO. Portanto:
    // - mismatched/duplicates: só aparecem se houver cadastro correspondente no conjunto filtrado;
    // - onlyInRegistry: são os cadastros filtrados que não aparecem na fatura;
    // - onlyInInvoice: como não há cadastro filtrado correspondente, NÃO entram quando há filtro (só aparecem sem filtros ou se o CPF estiver no cadastro filtrado).
    for (const [cpf, info] of mapFatura.entries()) {
      const ativo = mapAtivos.get(cpf);
      if (!ativo) {
        // só incluímos "só na fatura" quando não há filtros aplicados,
        // ou quando existir cadastro correspondente (o que não é o caso deste branch).
        const anyFilter = !!(filters.tipo || filters.plano || filters.centro);
        if (!anyFilter) {
          onlyInInvoice.push({ cpf: this.maskCpf(cpf), nome: info.nome || '—', valorCobrado: toBRL(info.soma) });
        }
        continue;
      }
      if (info.valores.length > 1) {
        duplicates.push({
          cpf: this.maskCpf(cpf),
          nome: ativo.nome || info.nome || '—',
          ocorrencias: info.valores.length,
          somaCobrada: toBRL(info.soma),
          valores: info.valores.map((v) => toBRL(v)),
        });
      }
      const diff = Math.abs(info.soma - ativo.mensalidade);
      if (diff > 0.009) {
        mismatched.push({
          cpf: this.maskCpf(cpf),
          nome: ativo.nome || info.nome || '—',
          valorCobrado: toBRL(info.soma),
          valorMensalidade: toBRL(ativo.mensalidade),
          diferenca: toBRL(info.soma - ativo.mensalidade),
        });
      }
    }

    // Só no cadastro (filtrado)
    for (const [cpf, ativo] of mapAtivos.entries()) {
      if (!mapFatura.has(cpf)) {
        onlyInRegistry.push({
          cpf: this.maskCpf(cpf),
          nome: ativo.nome || '—',
          valorMensalidade: toBRL(ativo.mensalidade),
        });
      }
    }

    // Ordena
    onlyInInvoice.sort((a, b) => a.nome.localeCompare(b.nome));
    onlyInRegistry.sort((a, b) => a.nome.localeCompare(b.nome));
    mismatched.sort((a, b) => a.nome.localeCompare(b.nome));
    duplicates.sort((a, b) => a.nome.localeCompare(b.nome));

    return {
      ok: true,
      clientId,
      mesReferencia: mesStr,
      totals: {
        faturaCount,
        faturaSum: toBRL(toNumber(faturaAgg._sum.valorCobradoOperadora ?? 0)),
        ativosCount: mapAtivos.size,
        onlyInInvoice: onlyInInvoice.length,
        onlyInRegistry: onlyInRegistry.length,
        mismatched: mismatched.length,
        duplicates: duplicates.length,
      },
      filtersApplied: filters,
      tabs: { onlyInInvoice, onlyInRegistry, mismatched, duplicates },
    };
  }

  // == EXPORT ==
  async exportReconciliation(
    clientId: string,
    opts: {
      mesReferencia?: Date;
      format: 'xlsx' | 'csv';
      tab: 'mismatched' | 'onlyInInvoice' | 'onlyInRegistry' | 'duplicates' | 'all';
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

    // Monta datasets
    const sheets = {
      mismatched: {
        name: 'Divergentes',
        rows: payload.tabs.mismatched.map((r) => ({
          CPF: r.cpf, Beneficiario: r.nome,
          Valor_Cobrado: r.valorCobrado, Valor_Mensalidade: r.valorMensalidade, Diferenca: r.diferenca,
        })),
      },
      onlyInInvoice: {
        name: 'So_na_fatura',
        rows: payload.tabs.onlyInInvoice.map((r) => ({
          CPF: r.cpf, Beneficiario: r.nome, Valor_Cobrado: r.valorCobrado,
        })),
      },
      onlyInRegistry: {
        name: 'So_no_cadastro',
        rows: payload.tabs.onlyInRegistry.map((r) => ({
          CPF: r.cpf, Beneficiario: r.nome, Valor_Mensalidade: r.valorMensalidade,
        })),
      },
      duplicates: {
        name: 'Duplicados',
        rows: payload.tabs.duplicates.map((r) => ({
          CPF: r.cpf, Beneficiario: r.nome, Ocorrencias: r.ocorrencias, Soma_Cobrada: r.somaCobrada, Valores: r.valores.join(', '),
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
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return {
          filename: `reconciliacao_${clientId}_${yyyymm}${sheetNameSuffix()}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: buf as Buffer,
        };
      } else {
        const s = sheets[opts.tab];
        const ws = XLSX.utils.json_to_sheet(s.rows);
        XLSX.utils.book_append_sheet(wb, ws, s.name);
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return {
          filename: `reconciliacao_${opts.tab}_${clientId}_${yyyymm}${sheetNameSuffix()}.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: buf as Buffer,
        };
      }
    }

    // CSV
    const s = sheets[opts.tab as Exclude<typeof opts.tab, 'all'>];
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

  private maskCpf(cpf: string) {
    const d = (cpf || '').replace(/\D/g, '').padStart(11, '•');
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`;
  }
}
