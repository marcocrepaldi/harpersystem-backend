/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, BadRequestException } from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  BeneficiarioStatus,
  BeneficiarioTipo,
  RegimeCobranca,
  MotivoMovimento,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'node:crypto';

import {
  normalizeCpf as padCpfTo11,
  isValidCpf,
  onlyDigits as digitsOnly,
  normalizeCpfFromLayout,
  CpfStatus,
} from '../common/cpf';

/* ===================== Helpers ===================== */

const norm = (s: any) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toUpperCase();

const normLower = (s: any) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

const maskCpf = (raw?: string | null) => {
  if (!raw) return null;
  const s = String(raw).replace(/\D/g, '').padStart(11, '0').slice(-11);
  if (s.length !== 11) return raw;
  return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));
function fromExcelSerial(n: number): Date {
  const d = new Date(EXCEL_EPOCH);
  d.setUTCDate(d.getUTCDate() + Math.floor(n));
  return d;
}

function parseDateFlexible(raw: any): Date | null {
  if (raw == null) return null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = fromExcelSerial(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(raw).trim();
  if (!s) return null;

  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  const m1 = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})$/);
  if (m1) {
    let [, dd, mm, yy] = m1;
    if (yy.length === 2) yy = String(2000 + Number(yy));
    const d = new Date(Date.UTC(Number(yy), Number(mm) - 1, Number(dd)));
    return isNaN(d.getTime()) ? null : d;
  }

  const m2 = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (m2) {
    const [, yyyy, mm, dd] = m2;
    const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function toIsoStringOrNull(raw: any): string | null {
  const d = parseDateFlexible(raw);
  return d ? d.toISOString() : null;
}

function normalizeTipoFromCsv(
  tipoUsuario: any,
  grauParentesco?: any,
): BeneficiarioTipo {
  const t = norm(tipoUsuario);
  if (t.startsWith('TITULAR')) return BeneficiarioTipo.TITULAR;
  const g = norm(grauParentesco);
  if (g.startsWith('CONJUGE') || g.startsWith('CONJUGUE'))
    return BeneficiarioTipo.CONJUGE;
  return BeneficiarioTipo.FILHO;
}

function statusFromCsv(dtCancelamento: any): BeneficiarioStatus {
  const has = String(dtCancelamento ?? '').trim().length > 0;
  return has ? BeneficiarioStatus.INATIVO : BeneficiarioStatus.ATIVO;
}

/** NOVA REGRA: Data_Cadastro é o início da vigência; se vazio, usa Dt_Admissao */
function entradaFromCsv(dtCadastro: any, dtAdmissao: any): Date {
  const c = parseDateFlexible(dtCadastro);
  if (c) return c;
  const a = parseDateFlexible(dtAdmissao);
  if (a) return a;
  return new Date();
}

function saidaFromCsv(dtCancelamento: any): Date | undefined {
  const d = parseDateFlexible(dtCancelamento);
  return d ?? undefined;
}

/** Parser simples CSV (usado porque o layout já vem limpo do front) */
function parseCsvBuffer(buf: Buffer): Array<Record<string, string>> {
  const text = buf.toString('utf8');
  const firstLine =
    text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) >
    (firstLine.match(/,/g)?.length ?? 0)
      ? ';'
      : ',';

  const rows: Array<Record<string, string>> = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return rows;

  const headers = lines[0].split(sep).map((h) => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split(sep);
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => (rec[h] = (cols[idx] ?? '').trim()));
    rows.push(rec);
  }
  return rows;
}

/* ---------- chaves de “família” para ligar titular/dependentes ---------- */
function baseFromCodigoUsuario(code: any): string | null {
  const s = String(code ?? '');
  // pega 9 dígitos finais (xxxxxxYYY) e usa os 6 primeiros como base
  const m = s.match(/(\d{6})\d{3}$/);
  return m ? m[1] : null;
}
function familyKey(row: Record<string, any>): string {
  const base = baseFromCodigoUsuario(row['Codigo_Usuario']);
  if (base) return `C:${base}`;
  // fallback por combinação mais estável
  const emp = String(row['Empresa'] ?? '').trim();
  const mat = String(row['Matricula'] ?? '').trim();
  const pla = String(row['Plano'] ?? '').trim();
  const fil = String(row['Filial'] ?? '').trim();
  return `M:${emp}|${mat}|${pla}|${fil}`;
}

/* ===================== Tipos do payload ===================== */

type DiffScope = 'core' | 'operadora';
type Diff = { scope: DiffScope; field: string; before: any; after: any };

type UpdatedDetail = {
  row: number;
  id: string;
  cpf?: string | null;
  nome?: string | null;
  tipo?: string | null;
  matchBy: 'CPF' | 'NOME_DTNASC' | 'CPF_LEGACY';
  changed: Diff[];
};

type UploadSummary = {
  totalLinhas: number;
  processados: number;
  criados: number;
  atualizados: number;
  rejeitados: number;
  atualizadosPorCpf: number;
  atualizadosPorNomeData: number;
  duplicadosNoArquivo: { cpf: string; ocorrencias: number }[];
  porMotivo?: { motivo: string; count: number }[];
  porTipo?: {
    titulares: { criados: number; atualizados: number };
    dependentes: { criados: number; atualizados: number };
  };
};

type UploadResult = {
  ok: boolean;
  runId: string;
  summary: UploadSummary;
  errors: Array<{ row: number; motivo: string; dados?: any }>;
  updatedDetails: UpdatedDetail[];
  duplicatesInFile: { cpf: string; rows: number[] }[];
};

type PageResult<T> = { items: T[]; page: number; limit: number; total: number };

/* ===================== Service ===================== */

@Injectable()
export class BeneficiariesService {
  constructor(private readonly prisma: PrismaService) {}

  get beneficiaryDelegate() {
    return (this.prisma as unknown as PrismaClient).beneficiario;
  }

  /** Resolve planId a partir do valor da coluna Plano do CSV */
  private async resolvePlanForClient(
    _clientId: string,
    planoDoCsv: any,
  ): Promise<{ planId: string } | null> {
    const original = String(planoDoCsv ?? '').trim();
    const lower = original.toLowerCase();
    const key = normLower(original);
    if (!key) return null;

    const alias = await this.prisma.planAlias.findFirst({
      where: { alias: key },
      select: { planId: true },
    });
    if (alias) return { planId: alias.planId };

    const candidates = await this.prisma.healthPlan.findMany({
      where: {
        OR: [
          { slug: { equals: original, mode: 'insensitive' } },
          { slug: { equals: lower, mode: 'insensitive' } },
          { slug: { contains: original, mode: 'insensitive' } },
          { name: { equals: original, mode: 'insensitive' } },
          { name: { contains: original, mode: 'insensitive' } },
        ],
      },
      select: { id: true, slug: true, name: true },
      take: 5,
    });

    if (candidates.length) {
      const exact = candidates.find(
        (p) => normLower(p.slug) === key || normLower(p.name) === key,
      );
      return { planId: (exact ?? candidates[0]).id };
    }

    return null;
  }

  private async pickClientPlanPrice(
    clientId: string,
    planId: string,
    faixaEtaria?: string | null,
  ) {
    const today = new Date();
    const sod = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const fetch = async (withFaixa: boolean) => {
      const where: Prisma.ClientHealthPlanPriceWhereInput = {
        clientId,
        planId,
        ...(withFaixa && faixaEtaria ? { faixaEtaria } : {}),
      };

      const prices = await this.prisma.clientHealthPlanPrice.findMany({
        where,
        orderBy: [{ vigenciaInicio: 'desc' }],
        take: 200,
      });
      if (!prices.length) return null;

      const vigente = prices.find((p) => {
        const ini = new Date(
          p.vigenciaInicio.getFullYear(),
          p.vigenciaInicio.getMonth(),
          p.vigenciaInicio.getDate(),
        );
        const fim = p.vigenciaFim
          ? new Date(
              p.vigenciaFim.getFullYear(),
              p.vigenciaFim.getMonth(),
              p.vigenciaFim.getDate(),
            )
          : null;
        return +sod >= +ini && (!fim || +sod <= +fim);
      });

      return vigente ?? prices[0];
    };

    const withBand = await fetch(true);
    if (withBand) return withBand;
    return await fetch(false);
  }

  /* ---------------- Listagem ---------------- */

  async list(
    clientId: string,
    opts: {
      search?: string;
      tipo?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<PageResult<any>> {
    const page = Math.max(1, Number(opts.page ?? 1));
    const limit = Math.max(1, Math.min(5000, Number(opts.limit ?? 1000)));

    const where: Prisma.BeneficiarioWhereInput = {
      clientId,
      ...(opts.tipo ? { tipo: opts.tipo as any } : {}),
      ...(opts.status ? { status: opts.status as any } : {}),
    };

    if (opts.search && opts.search.trim() !== '') {
      const s = opts.search.trim();
      where.OR = [
        { nomeCompleto: { contains: s, mode: 'insensitive' } },
        { cpf: { equals: digitsOnly(s) || s } },
        { carteirinha: { contains: s, mode: 'insensitive' } },
        { contrato: { contains: s, mode: 'insensitive' } },
        { plano: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.beneficiario.count({ where }),
      this.prisma.beneficiario.findMany({
        where,
        orderBy: [{ nomeCompleto: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { operadora: true },
      }),
    ]);

    const items = rows.map((b) => {
      const o = b.operadora;

      let cpfStatus: CpfStatus = 'missing';
      let cpfMessage = 'CPF ausente no layout.';
      const rawLayout =
        b.tipo === BeneficiarioTipo.TITULAR ? o?.cpfOperadora : o?.cpfDependente;
      const rawDigits = rawLayout ? digitsOnly(rawLayout) : '';

      if (b.cpf && isValidCpf(b.cpf)) {
        if (rawDigits && rawDigits.length < 11 && padCpfTo11(rawDigits) === b.cpf) {
          cpfStatus = 'adjusted';
          cpfMessage =
            'CPF ajustado com zeros à esquerda a partir do layout.';
        } else {
          cpfStatus = 'valid';
          cpfMessage = 'CPF válido.';
        }
      } else {
        const info = normalizeCpfFromLayout(rawDigits);
        cpfStatus = info.status;
        cpfMessage = info.message ?? cpfMessage;
      }

      return {
        id: b.id,
        nomeCompleto: b.nomeCompleto,
        cpf: maskCpf(b.cpf),

        cpfStatus,
        cpfMessage,

        tipo: b.tipo,
        dataEntrada: b.dataEntrada,
        dataNascimento: b.dataNascimento,
        idade: b.dataNascimento ? this.calcAge(b.dataNascimento) : null,
        valorMensalidade: b.valorMensalidade ? Number(b.valorMensalidade) : null,
        titularId: b.titularId,
        matricula: b.matricula,
        carteirinha: b.carteirinha,
        sexo: b.sexo,
        plano: b.plano,
        centroCusto: b.centroCusto,
        faixaEtaria: b.faixaEtaria,
        estado: b.estado,
        contrato: b.contrato,
        comentario: b.comentario,
        regimeCobranca: b.regimeCobranca,
        motivoMovimento: b.motivoMovimento,
        observacoes: b.observacoes,
        status: b.status,
        dataSaida: b.dataSaida,

        // Operadora
        Empresa: o?.empresa ?? null,
        Cpf: o?.cpfOperadora ?? null,
        Usuario: o?.usuario ?? null,
        Nm_Social: o?.nomeSocial ?? null,
        Estado_Civil: o?.estadoCivil ?? null,
        Data_Nascimento: o?.dataNascimentoOperadora ?? null,
        Sexo: o?.sexoOperadora ?? null,
        Identidade: o?.identidade ?? null,
        Orgao_Exp: o?.orgaoExpedidor ?? null,
        Uf_Orgao: o?.ufOrgao ?? null,
        Uf_Endereco: o?.ufEndereco ?? null,
        Cidade: o?.cidade ?? null,
        Tipo_Logradouro: o?.tipoLogradouro ?? null,
        Logradouro: o?.logradouro ?? null,
        Numero: o?.numero ?? null,
        Complemento: o?.complemento ?? null,
        Bairro: o?.bairro ?? null,
        Cep: o?.cep ?? null,
        Fone: o?.fone ?? null,
        Celular: o?.celular ?? null,
        Plano: o?.planoOperadora ?? null,
        Matricula: o?.matriculaOperadora ?? null,
        Filial: o?.filial ?? null,
        Codigo_Usuario: o?.codigoUsuario ?? null,
        Dt_Admissao: o?.dataAdmissao ?? null,
        Codigo_Congenere: o?.codigoCongenere ?? null,
        Nm_Congenere: o?.nomeCongenere ?? null,
        Tipo_Usuario: o?.tipoUsuario ?? null,
        Nome_Mae: o?.nomeMae ?? null,
        Pis: o?.pis ?? null,
        Cns: o?.cns ?? null,
        Ctps: o?.ctps ?? null,
        Serie_Ctps: o?.serieCtps ?? null,
        Data_Processamento: o?.dataProcessamento ?? null,
        Data_Cadastro: o?.dataCadastro ?? null,
        Unidade: o?.unidade ?? null,
        Descricao_Unidade: o?.descricaoUnidade ?? null,
        Cpf_Dependente: o?.cpfDependente ?? null,
        Grau_Parentesco: o?.grauParentesco ?? null,
        Dt_Casamento: o?.dataCasamento ?? null,
        Nu_Registro_Pessoa_Natural: o?.nuRegistroPessoaNatural ?? null,
        Cd_Tabela: o?.cdTabela ?? null,
        Empresa_Utilizacao: o?.empresaUtilizacao ?? null,
        Dt_Cancelamento: o?.dataCancelamento ?? null,
      };
    });

    return { items, page, limit, total };
  }

  private calcAge(dob: Date): number {
    const ref = new Date();
    let age = ref.getFullYear() - dob.getFullYear();
    const m = ref.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < dob.getDate())) age--;
    return age;
  }

  async remove(_clientId: string, id: string) {
    await this.prisma.beneficiario.delete({ where: { id } });
    return { ok: true };
  }

  async removeMany(clientId: string, ids: string[]) {
    const res = await this.prisma.beneficiario.deleteMany({
      where: { clientId, id: { in: ids } },
    });
    return { ok: true, deleted: res.count };
  }

  // ================== UPLOAD REAL ==================
  async upload(clientId: string, file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo vazio.');
    }

    const rows = parseCsvBuffer(file.buffer);
    const required = ['Codigo_Usuario', 'Usuario', 'Tipo_Usuario', 'Cpf'];
    const hasAll = required.every((k) => k in (rows[0] ?? {}));
    if (!hasAll) {
      throw new BadRequestException(
        `Layout inesperado. Cabeçalho mínimo esperado: ${required.join(', ')}.`,
      );
    }

    const runId = randomUUID();

    const summary: UploadSummary = {
      totalLinhas: rows.length,
      processados: 0,
      criados: 0,
      atualizados: 0,
      rejeitados: 0,
      atualizadosPorCpf: 0,
      atualizadosPorNomeData: 0,
      duplicadosNoArquivo: [],
      porMotivo: [],
      porTipo: {
        titulares: { criados: 0, atualizados: 0 },
        dependentes: { criados: 0, atualizados: 0 },
      },
    };

    const errors: Array<{ row: number; motivo: string; dados?: any }> = [];
    const updatedDetails: UpdatedDetail[] = [];
    const dupMap = new Map<string, number[]>();

    // cache de titulares já existentes
    const titularesCache = new Map<string, string>();
    const titularesExistentes = await this.prisma.beneficiario.findMany({
      where: { clientId, tipo: BeneficiarioTipo.TITULAR },
      select: { id: true, cpf: true },
    });
    titularesExistentes.forEach((t) => {
      if (t.cpf) titularesCache.set(t.cpf, t.id);
    });

    /* =========================================================
     * PRÉ-PASSO: Cpf_Dependente “vazado” na linha do TITULAR.
     * Guardar a dica apenas se for um CPF válido e DIFERENTE
     * do CPF do titular; colar no dependente seguinte da MESMA
     * família (familyKey).
     * =======================================================*/
    let lastTitularKey: string | null = null;
    let carriedCpfDep: string | null = null;

    for (const r of rows) {
      const tipoStr = norm(r['Tipo_Usuario'] ?? r['Parentesco']);
      const key = familyKey(r);

      if (tipoStr.startsWith('TITULAR')) {
        lastTitularKey = key;

        const titularCpf = digitsOnly(r['Cpf'] || '');
        const depOnTit = digitsOnly(r['Cpf_Dependente'] || '');

        const isValidDepOnTit =
          depOnTit.length === 11 && depOnTit !== titularCpf;

        carriedCpfDep = isValidDepOnTit ? depOnTit : null;
      } else {
        const ownDep = digitsOnly(r['Cpf_Dependente'] || '');
        if (!ownDep && carriedCpfDep && key === lastTitularKey) {
          (r as any)._cpfDepFallback = carriedCpfDep; // cola a dica
          carriedCpfDep = null; // consome
        }
        if (key !== lastTitularKey) {
          carriedCpfDep = null;
          lastTitularKey = key;
        }
      }
    }

    // ================= transação =================
    await this.prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < rows.length; i++) {
          const rowNum = i + 2;
          const r = rows[i];

          try {
            const usuario = (r['Usuario'] ?? '').trim();
            const tipoUsuario = r['Tipo_Usuario'];
            const grauParentesco = r['Grau_Parentesco'];

            const isTitularCsv = norm(tipoUsuario).startsWith('TITULAR');
            const tipo = normalizeTipoFromCsv(tipoUsuario, grauParentesco);

            const rawCpfTitular = digitsOnly(r['Cpf']);
            const rawCpfDepend = digitsOnly(r['Cpf_Dependente']);
            const hintedCpfDep = digitsOnly((r as any)._cpfDepFallback || '');

            if (!usuario) {
              summary.rejeitados++;
              errors.push({
                row: rowNum,
                motivo: 'Nome (Usuario) vazio',
                dados: r,
              });
              continue;
            }

            // datas e status
            const dtEntrada = entradaFromCsv(
              r['Data_Cadastro'],
              r['Dt_Admissao'],
            );
            const dtCancelamento = saidaFromCsv(r['Dt_Cancelamento']);
            const st = statusFromCsv(r['Dt_Cancelamento']);
            const dataNascimento =
              parseDateFlexible(r['Data_Nascimento']) ?? undefined;
            const sexo = (() => {
              const s = norm(r['Sexo']);
              if (s.startsWith('M')) return 'M';
              if (s.startsWith('F')) return 'F';
              return undefined;
            })();

            // titularId (para dependentes)
            let titularId: string | undefined;
            if (!isTitularCsv && rawCpfTitular) {
              const titularCpfNorm = padCpfTo11(rawCpfTitular);
              if (titularCpfNorm) {
                titularId = titularesCache.get(titularCpfNorm);
                if (!titularId) {
                  const t = await tx.beneficiario.findFirst({
                    where: {
                      clientId,
                      tipo: BeneficiarioTipo.TITULAR,
                      cpf: titularCpfNorm,
                    },
                    select: { id: true },
                  });
                  if (t) {
                    titularId = t.id;
                    titularesCache.set(titularCpfNorm, t.id);
                  }
                }
              }
            }

            // ======== ESCOLHA DO CPF (dependente) =========
            let chosenRaw = isTitularCsv
              ? rawCpfTitular
              : rawCpfDepend || hintedCpfDep || '';

            // se o "escolhido" para o dependente for igual ao CPF do titular, ignore
            if (
              !isTitularCsv &&
              chosenRaw &&
              rawCpfTitular &&
              chosenRaw === rawCpfTitular
            ) {
              chosenRaw = '';
            }

            // Se ainda ficou vazio, e houver titular + nome, tenta corrigir pelo cadastro
            if (!isTitularCsv && !chosenRaw && titularId && usuario) {
              const dep = await tx.beneficiario.findFirst({
                where: {
                  clientId,
                  titularId,
                  nomeCompleto: { equals: usuario, mode: 'insensitive' },
                },
                select: { cpf: true },
              });
              if (dep?.cpf) chosenRaw = dep.cpf;
            }

            // normalização/validação
            const cpfInfo = normalizeCpfFromLayout(chosenRaw);

            if (cpfInfo.status === 'adjusted') {
              errors.push({
                row: rowNum,
                motivo: 'CPF ajustado',
                dados: {
                  cpfBruto: chosenRaw,
                  mensagem: cpfInfo.message,
                  cpfAjustado: cpfInfo.clean,
                },
              });
            } else if (cpfInfo.status === 'invalid') {
              errors.push({
                row: rowNum,
                motivo: 'CPF inválido',
                dados: { cpfBruto: chosenRaw, mensagem: cpfInfo.message },
              });
            } else if (cpfInfo.status === 'missing') {
              errors.push({
                row: rowNum,
                motivo: 'CPF ausente',
                dados: { mensagem: cpfInfo.message },
              });
            }

            // tentativa de match existente
            let existing:
              | null
              | {
                  id: string;
                  cpf: string | null;
                  dataNascimento: Date | null;
                  nomeCompleto: string | null;
                } = null;
            let matchBy: 'CPF' | 'NOME_DTNASC' | 'CPF_LEGACY' = 'CPF';

            if (cpfInfo.clean) {
              existing = await tx.beneficiario.findFirst({
                where: { clientId, cpf: cpfInfo.clean },
                select: {
                  id: true,
                  cpf: true,
                  dataNascimento: true,
                  nomeCompleto: true,
                },
              });
            }
            if (!existing && chosenRaw.length > 0) {
              existing = await tx.beneficiario.findFirst({
                where: { clientId, cpf: chosenRaw },
                select: {
                  id: true,
                  cpf: true,
                  dataNascimento: true,
                  nomeCompleto: true,
                },
              });
              if (existing) matchBy = 'CPF_LEGACY';
            }
            if (!existing && usuario && dataNascimento) {
              existing = await tx.beneficiario.findFirst({
                where: {
                  clientId,
                  nomeCompleto: { equals: usuario, mode: 'insensitive' },
                  dataNascimento: dataNascimento as any,
                },
                select: {
                  id: true,
                  cpf: true,
                  dataNascimento: true,
                  nomeCompleto: true,
                },
              });
              if (existing) matchBy = 'NOME_DTNASC';
            }

            // NUNCA sobrescrever CPF existente com null
            const finalCpf: string | null =
              (cpfInfo.clean as any) ?? existing?.cpf ?? null;

            // core data
            const coreData: Prisma.BeneficiarioUncheckedCreateInput = {
              clientId,
              titularId: titularId ?? null,
              nomeCompleto: usuario,
              cpf: finalCpf, // uso do CPF final protegido
              tipo,
              dataEntrada: dtEntrada,
              dataSaida: dtCancelamento ?? null,
              status: st,
              sexo: (sexo as any) ?? null,
              dataNascimento: (dataNascimento as any) ?? null,
              valorMensalidade: null,
              plano: (r['Plano'] ?? null) || null,
              centroCusto: null,
              faixaEtaria: null,
              matricula: String(r['Matricula'] ?? '').trim() || null,
              carteirinha: null,
              estado: String(r['Uf_Endereco'] ?? '').trim() || null,
              contrato: null,
              comentario: null,
              regimeCobranca: null as unknown as RegimeCobranca,
              motivoMovimento: null as unknown as MotivoMovimento,
              observacoes: null,
            };

            // preço por plano (opcional)
            const planoDoCsv = r['Plano'] ?? coreData.plano;
            const resolved = await this.resolvePlanForClient(
              clientId,
              planoDoCsv,
            );
            if (resolved) {
              const price = await this.pickClientPlanPrice(
                clientId,
                resolved.planId,
                coreData.faixaEtaria ?? undefined,
              );
              if (price?.valor != null) {
                coreData.valorMensalidade =
                  price.valor as unknown as Prisma.Decimal;
              }
            }

            // dados operadora — refletir CPF efetivo do dependente
            const opCreateData: Prisma.BeneficiarioOperadoraCreateWithoutBeneficiarioInput =
              {
                empresa: r['Empresa'] ?? null,
                cpfOperadora: rawCpfTitular || null, // CPF “Cpf” do layout (titular)
                usuario: r['Usuario'] ?? null,
                nomeSocial: r['Nm_Social'] ?? null,
                estadoCivil: r['Estado_Civil'] ?? null,
                dataNascimentoOperadora: toIsoStringOrNull(
                  r['Data_Nascimento'],
                ),
                sexoOperadora: r['Sexo'] ?? null,
                identidade: r['Identidade'] ?? null,
                orgaoExpedidor: r['Orgao_Exp'] ?? null,
                ufOrgao: r['Uf_Orgao'] ?? null,
                ufEndereco: r['Uf_Endereco'] ?? null,
                cidade: r['Cidade'] ?? null,
                tipoLogradouro: r['Tipo_Logradouro'] ?? null,
                logradouro: r['Logradouro'] ?? null,
                numero: r['Numero'] ?? null,
                complemento: r['Complemento'] ?? null,
                bairro: r['Bairro'] ?? null,
                cep: r['Cep'] ?? null,
                fone: r['Fone'] ?? null,
                celular: r['Celular'] ?? null,
                planoOperadora: r['Plano'] ?? null,
                matriculaOperadora: r['Matricula'] ?? null,
                filial: r['Filial'] ?? null,
                codigoUsuario: r['Codigo_Usuario'] ?? null,
                dataAdmissao: toIsoStringOrNull(r['Dt_Admissao']),
                codigoCongenere: r['Codigo_Congenere'] ?? null,
                nomeCongenere: r['Nm_Congenere'] ?? null,
                tipoUsuario: r['Tipo_Usuario'] ?? null,
                nomeMae: r['Nome_Mae'] ?? null,
                pis: r['Pis'] ?? null,
                cns: r['Cns'] ?? null,
                ctps: r['Ctps'] ?? null,
                serieCtps: r['Serie_Ctps'] ?? null,
                dataProcessamento: toIsoStringOrNull(r['Data_Processamento']),
                dataCadastro: toIsoStringOrNull(r['Data_Cadastro']),
                unidade: r['Unidade'] ?? null,
                descricaoUnidade: r['Descricao_Unidade'] ?? null,
                cpfDependente: isTitularCsv ? null : finalCpf, // usa CPF efetivo do dependente
                grauParentesco: r['Grau_Parentesco'] ?? null,
                dataCasamento: toIsoStringOrNull(r['Dt_Casamento']),
                nuRegistroPessoaNatural:
                  r['Nu_Registro_Pessoa_Natural'] ?? null,
                cdTabela: r['Cd_Tabela'] ?? null,
                empresaUtilizacao: r['Empresa_Utilizacao'] ?? null,
                dataCancelamento: toIsoStringOrNull(r['Dt_Cancelamento']),
              };

            const opUpdateData: Prisma.BeneficiarioOperadoraUpdateWithoutBeneficiarioInput =
              { ...opCreateData };

            if (!existing) {
              const created = await tx.beneficiario.create({
                data: { ...coreData, operadora: { create: opCreateData } },
                select: { id: true, tipo: true, cpf: true, nomeCompleto: true },
              });

              if (created.tipo === BeneficiarioTipo.TITULAR && created.cpf) {
                titularesCache.set(created.cpf, created.id);
              }

              summary.criados++;
              summary.processados++;
              if (created.tipo === BeneficiarioTipo.TITULAR)
                summary.porTipo!.titulares.criados++;
              else summary.porTipo!.dependentes.criados++;

              const changed: Diff[] = [];
              if (coreData.valorMensalidade != null) {
                changed.push({
                  scope: 'core',
                  field: 'valorMensalidade',
                  before: null,
                  after: coreData.valorMensalidade,
                });
              }
              if (cpfInfo.status === 'adjusted') {
                changed.push({
                  scope: 'core',
                  field: 'cpf',
                  before: null,
                  after: coreData.cpf,
                });
              }

              if (changed.length) {
                updatedDetails.push({
                  row: rowNum,
                  id: created.id,
                  cpf: created.cpf,
                  nome: created.nomeCompleto,
                  tipo: created.tipo as any,
                  matchBy: cpfInfo.clean ? 'CPF' : 'NOME_DTNASC',
                  changed,
                });
              }
            } else {
              const before = await tx.beneficiario.findUnique({
                where: { id: existing.id },
                include: { operadora: true },
              });

              const upd = await tx.beneficiario.update({
                where: { id: existing.id },
                data: {
                  ...coreData,
                  operadora: {
                    upsert: { create: opCreateData, update: opUpdateData },
                  },
                },
                include: { operadora: true },
              });

              const changed: Diff[] = [];
              (
                [
                  'nomeCompleto',
                  'cpf',
                  'tipo',
                  'dataEntrada',
                  'dataSaida',
                  'status',
                  'sexo',
                  'dataNascimento',
                  'plano',
                  'matricula',
                  'estado',
                  'valorMensalidade',
                ] as (keyof Prisma.BeneficiarioUncheckedCreateInput)[]
              ).forEach((k) => {
                const b = (before as any)?.[k];
                const a = (upd as any)?.[k];
                if (String(b ?? '') !== String(a ?? '')) {
                  changed.push({
                    scope: 'core',
                    field: String(k),
                    before: b,
                    after: a,
                  });
                }
              });

              Object.keys(opCreateData).forEach((k) => {
                const b = (before as any)?.operadora?.[k];
                const a = (upd as any)?.operadora?.[k];
                if (String(b ?? '') !== String(a ?? '')) {
                  changed.push({
                    scope: 'operadora',
                    field: String(k),
                    before: b,
                    after: a,
                  });
                }
              });

              summary.atualizados++;
              summary.processados++;
              if (matchBy === 'CPF') summary.atualizadosPorCpf++;
              else summary.atualizadosPorNomeData++;

              if (upd.tipo === BeneficiarioTipo.TITULAR)
                summary.porTipo!.titulares.atualizados++;
              else summary.porTipo!.dependentes.atualizados++;

              if (changed.length) {
                updatedDetails.push({
                  row: rowNum,
                  id: upd.id,
                  cpf: upd.cpf,
                  nome: upd.nomeCompleto,
                  tipo: upd.tipo,
                  matchBy,
                  changed,
                });
              }
            }

            if (cpfInfo.clean) {
              const arr = dupMap.get(cpfInfo.clean) ?? [];
              arr.push(rowNum);
              dupMap.set(cpfInfo.clean, arr);
            }
          } catch (e: any) {
            summary.rejeitados++;
            errors.push({
              row: rowNum,
              motivo: e?.message ?? 'Falha ao processar linha',
              dados: rows[i],
            });
          }
        }

        const duplicatesInFile: { cpf: string; rows: number[] }[] = [];
        for (const [cpf, arr] of dupMap.entries()) {
          if (arr.length > 1) duplicatesInFile.push({ cpf, rows: arr });
        }

        const payload: UploadResult = {
          ok: true,
          runId,
          summary,
          errors,
          updatedDetails,
          duplicatesInFile,
        };

        await tx.importRun.updateMany({
          where: { clientId, latest: true },
          data: { latest: false },
        });
        await tx.importRun.create({
          data: { clientId, runId, latest: true, payload },
        });
      },
      { timeout: 120_000 },
    );

    const latest = await this.getLatestImportRun(clientId);
    return latest?.payload as UploadResult;
  }

  async getLatestImportRun(clientId: string) {
    const byFlag = await this.prisma.importRun.findFirst({
      where: { clientId, latest: true },
      orderBy: { createdAt: 'desc' },
    });
    if (byFlag) return byFlag;

    const fallback = await this.prisma.importRun.findFirst({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    return fallback;
  }

  async getImportRun(clientId: string, runIdOrLatest: string) {
    if (runIdOrLatest === 'latest') {
      const r = await this.getLatestImportRun(clientId);
      if (!r) throw new BadRequestException('Nenhuma importação encontrada.');
      return r;
    }
    const r = await this.prisma.importRun.findFirst({
      where: { clientId, runId: runIdOrLatest },
    });
    if (!r) throw new BadRequestException('Importação não encontrada.');
    return r;
  }

  async deleteImportRun(clientId: string, runId: string) {
    const res = await this.prisma.importRun.deleteMany({
      where: { clientId, runId },
    });
    return { ok: true, deleted: res.count };
  }

  async clearAllImportRuns(clientId: string) {
    const res = await this.prisma.importRun.deleteMany({
      where: { clientId },
    });
    return { ok: true, deleted: res.count };
  }
}
