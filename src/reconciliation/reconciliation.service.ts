import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  tabs: {
    onlyInInvoice: Array<{ cpf: string; nome: string; valorCobrado: string }>;
    onlyInRegistry: Array<{ cpf: string; nome: string; valorMensalidade: string }>;
    mismatched: Array<{
      cpf: string; nome: string; valorCobrado: string; valorMensalidade: string; diferenca: string;
    }>;
    duplicates: Array<{
      cpf: string; nome: string; ocorrencias: number; somaCobrada: string; valores: string[];
    }>;
  };
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
        valorMensalidade: true, // <-- campo correto no seu schema
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
    const toNumber = (v: any) => Number(v || 0); // Prisma Decimal -> string; convertemos p/ somas simples
    const toBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Índice por CPF
    const mapAtivos = new Map<string, { nome: string; mensalidade: number }>();
    for (const b of ativos) {
      const cpf = clean(b.cpf);
      if (!cpf) continue;
      mapAtivos.set(cpf, {
        nome: b.nomeCompleto ?? '',
        mensalidade: toNumber(b.valorMensalidade), // pode ser 0 se null
      });
    }

    // Agrupa fatura por CPF (para somar e achar duplicados)
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
      // divergência (tolerância de 1 centavo)
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

    // Ordenações
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

  private maskCpf(cpf: string) {
    const d = (cpf || '').replace(/\D/g, '').padStart(11, '•');
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`;
  }
}
