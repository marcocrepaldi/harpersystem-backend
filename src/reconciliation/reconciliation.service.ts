import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

type ReconTabs = {
  onlyInInvoice: Array<{ cpf: string; nome: string; valorCobrado: string }>;
  onlyInRegistry: Array<{ cpf: string; nome: string; valorMensalidade: string }>;
  mismatched: Array<{
    cpf: string; nome: string; valorCobrado: string; valorMensalidade: string; diferenca: string;
  }>;
  duplicates: Array<{
    cpf: string; nome: string; ocorrencias: number; somaCobrada: string; valores: string[];
  }>;
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
  tabs: ReconTabs;
};

@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  // Beneficiários ATIVOS = status ATIVO e sem dataSaida
  private async fetchBeneficiariosAtivos(clientId: string) {
    return this.prisma.beneficiario.findMany({
      where: { clientId, status: 'ATIVO', dataSaida: null },
      select: {
        id: true,
        nomeCompleto: true,
        cpf: true,
        valorMensalidade: true,
      },
    });
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

  async buildReconciliation(clientId: string, mesReferenciaInput?: Date): Promise<ReconciliationPayload> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    const mesReferencia = mesReferenciaInput ?? this.currentMonthUTC();
    const mesStr = this.formatYYYYMM01(mesReferencia);

    // 1) Fatura importada do mês
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

    // 2) Beneficiários ativos
    const ativos = await this.fetchBeneficiariosAtivos(clientId);

    // Helpers
    const clean = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
    const toNumber = (v: any) => Number(v || 0);
    const toBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Índice por CPF
    const mapAtivos = new Map<string, { nome: string; mensalidade: number }>();
    for (const b of ativos) {
      const cpf = clean(b.cpf);
      if (!cpf) continue;
      mapAtivos.set(cpf, {
        nome: b.nomeCompleto ?? '',
        mensalidade: toNumber(b.valorMensalidade),
      });
    }

    // Fatura por CPF
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

    // Só na fatura / duplicados / divergentes
    for (const [cpf, info] of mapFatura.entries()) {
      const ativo = mapAtivos.get(cpf);
      if (!ativo) {
        onlyInInvoice.push({ cpf: this.maskCpf(cpf), nome: info.nome || '—', valorCobrado: toBRL(info.soma) });
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

    // Só no cadastro
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
    },
  ): Promise<{ filename: string; contentType: string; buffer: Buffer }> {
    const payload = await this.buildReconciliation(clientId, opts.mesReferencia);
    const yyyymm = payload.mesReferencia.slice(0, 7);

    // Monta datasets em JSON “flat”
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
          filename: `reconciliacao_${clientId}_${yyyymm}.xlsx`,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: buf as Buffer,
        };
      } else {
        const s = sheets[opts.tab];
        const ws = XLSX.utils.json_to_sheet(s.rows);
        XLSX.utils.book_append_sheet(wb, ws, s.name);
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return {
          filename: `reconciliacao_${opts.tab}_${clientId}_${yyyymm}.xlsx`,
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: buf as Buffer,
        };
      }
    }

    // CSV (somente 1 aba)
    const s = sheets[opts.tab as Exclude<typeof opts.tab, 'all'>];
    const ws = XLSX.utils.json_to_sheet(s.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, s.name);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'csv' });
    return {
      filename: `reconciliacao_${opts.tab}_${clientId}_${yyyymm}.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: buf as Buffer,
    };
  }

  private maskCpf(cpf: string) {
    const d = (cpf || '').replace(/\D/g, '').padStart(11, '•');
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`;
  }
}
