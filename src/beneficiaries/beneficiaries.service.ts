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

/**
 * Implementa listagem e upload com parsing do CSV real,
 * grava Beneficiario + relação 1:1 "operadora", e cria ImportRun.
 *
 * Extensões:
 * - resolvePlanForClient: resolve plano por HealthPlan.slug ou PlanAlias.alias (normalizado)
 * - pickClientPlanPrice: pega preço vigente (ou fallback mais recente) em ClientHealthPlanPrice
 * - Integra upload: define coreData.valorMensalidade a partir do preço do plano e loga em updatedDetails
 */

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

const digitsOnly = (v: any) => String(v ?? '').replace(/\D/g, '');

const toSexo = (v: any): 'M' | 'F' | undefined => {
  const s = norm(v);
  if (s.startsWith('M')) return 'M';
  if (s.startsWith('F')) return 'F';
  return undefined;
};

const EXCEL_EPOCH = new Date(Date.UTC(1899, 11, 30));
function fromExcelSerial(n: number): Date {
  const d = new Date(EXCEL_EPOCH);
  d.setUTCDate(d.getUTCDate() + Math.floor(n));
  return d;
}

/** Retorna Date (para campos do core) */
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

  const m1 = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m1) {
    const [, dd, mm, yyyy] = m1;
    const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
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

/** Converte input arbitrário em ISO string ou null (para os campos da tabela operadora que são string no Prisma). */
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
  if (g.startsWith('CONJUGE') || g.startsWith('CONJUGUE')) return BeneficiarioTipo.CONJUGE;
  return BeneficiarioTipo.FILHO;
}

function statusFromCsv(dtCancelamento: any): BeneficiarioStatus {
  const has = String(dtCancelamento ?? '').trim().length > 0;
  return has ? BeneficiarioStatus.INATIVO : BeneficiarioStatus.ATIVO;
}

function entradaFromCsv(dtAdmissao: any, dtCadastro: any): Date {
  const a = parseDateFlexible(dtAdmissao);
  if (a) return a;
  const c = parseDateFlexible(dtCadastro);
  if (c) return c;
  return new Date();
}

function saidaFromCsv(dtCancelamento: any): Date | undefined {
  const d = parseDateFlexible(dtCancelamento);
  return d ?? undefined;
}

function parseCsvBuffer(buf: Buffer): Array<Record<string, string>> {
  const text = buf.toString('utf8');
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
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

function normalizeCpf(v: any): string {
  const d = digitsOnly(v);
  return d.length === 11 ? d : '';
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
  matchBy: 'CPF' | 'NOME_DTNASC';
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

  /* --------- Resolução de plano e preço --------- */

  /** Resolve planId a partir do valor da coluna Plano do CSV, usando PlanAlias.alias (normalizado) ou HealthPlan.slug/name. */
  private async resolvePlanForClient(
    _clientId: string,
    planoDoCsv: any,
  ): Promise<{ planId: string } | null> {
    const original = String(planoDoCsv ?? '').trim();
    const lower = original.toLowerCase();
    const normKey = normLower(original);
    if (!normKey) return null;

    // 1) Bate por alias normalizado
    const alias = await this.prisma.planAlias.findFirst({
      where: { alias: normKey },
      select: { planId: true },
    });
    if (alias) return { planId: alias.planId };

    // 2) Tenta por slug/name de forma tolerante
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
        (p) => normLower(p.slug) === normKey || normLower(p.name) === normKey,
      );
      return { planId: (exact ?? candidates[0]).id };
    }

    return null;
  }

  /** Busca o preço vigente hoje; se não houver, usa o mais recente por vigenciaInicio. Tenta com faixaEtaria e depois sem. */
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
    opts: { search?: string; tipo?: string; status?: string; page?: number; limit?: number },
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
      return {
        id: b.id,
        nomeCompleto: b.nomeCompleto,
        cpf: b.cpf,
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

    const titularesCache = new Map<string, string>();
    const titularesExistentes = await this.prisma.beneficiario.findMany({
      where: { clientId, tipo: BeneficiarioTipo.TITULAR },
      select: { id: true, cpf: true },
    });
    titularesExistentes.forEach((t) => {
      if (t.cpf) titularesCache.set(t.cpf, t.id);
    });

    await this.prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < rows.length; i++) {
          const rowNum = i + 2;
          const r = rows[i];

          try {
            const usuario = (r['Usuario'] ?? '').trim();
            const tipoUsuario = r['Tipo_Usuario'];
            const grauParentesco = r['Grau_Parentesco'];

            const cpfTitularCsv = normalizeCpf(r['Cpf']);
            const cpfDependenteCsv = normalizeCpf(r['Cpf_Dependente']);

            const isTitularCsv = norm(tipoUsuario).startsWith('TITULAR');
            const tipo = normalizeTipoFromCsv(tipoUsuario, grauParentesco);

            const cpf = isTitularCsv ? cpfTitularCsv : cpfDependenteCsv;

            if (!usuario) {
              summary.rejeitados++;
              errors.push({ row: rowNum, motivo: 'Nome (Usuario) vazio', dados: r });
              continue;
            }

            const dtAdmissao = entradaFromCsv(r['Dt_Admissao'], r['Data_Cadastro']);
            const dtCancelamento = saidaFromCsv(r['Dt_Cancelamento']);
            const st = statusFromCsv(r['Dt_Cancelamento']);

            const dataNascimento = parseDateFlexible(r['Data_Nascimento']) ?? undefined;
            const sexo = toSexo(r['Sexo']);

            let titularId: string | undefined;
            if (!isTitularCsv && cpfTitularCsv) {
              titularId = titularesCache.get(cpfTitularCsv);
              if (!titularId) {
                const t = await tx.beneficiario.findFirst({
                  where: { clientId, tipo: BeneficiarioTipo.TITULAR, cpf: cpfTitularCsv },
                  select: { id: true },
                });
                if (t) {
                  titularId = t.id;
                  titularesCache.set(cpfTitularCsv, t.id);
                }
              }
            }

            let existing:
              | null
              | { id: string; cpf: string | null; dataNascimento: Date | null; nomeCompleto: string | null } =
              null;

            if (cpf) {
              existing = await tx.beneficiario.findFirst({
                where: { clientId, cpf },
                select: { id: true, cpf: true, dataNascimento: true, nomeCompleto: true },
              });
            }

            let matchBy: 'CPF' | 'NOME_DTNASC' = 'CPF';
            if (!existing && usuario && dataNascimento) {
              existing = await tx.beneficiario.findFirst({
                where: {
                  clientId,
                  nomeCompleto: { equals: usuario, mode: 'insensitive' },
                  dataNascimento: dataNascimento as any,
                },
                select: { id: true, cpf: true, dataNascimento: true, nomeCompleto: true },
              });
              if (existing) matchBy = 'NOME_DTNASC';
            }

            const coreData: Prisma.BeneficiarioUncheckedCreateInput = {
              clientId,
              titularId: titularId ?? null,
              nomeCompleto: usuario,
              cpf: cpf || null,
              tipo,
              dataEntrada: dtAdmissao,
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

            /* --------- NOVO: calcula valorMensalidade a partir do plano do CSV --------- */
            const planoDoCsv = r['Plano'] ?? coreData.plano;
            const resolved = await this.resolvePlanForClient(clientId, planoDoCsv);
            if (resolved) {
              const price = await this.pickClientPlanPrice(
                clientId,
                resolved.planId,
                coreData.faixaEtaria ?? undefined,
              );
              if (price?.valor != null) {
                // Prisma aceita Decimal diretamente
                coreData.valorMensalidade = price.valor as unknown as Prisma.Decimal;
              }
            }
            /* -------------------------------------------------------------------------- */

            // ====== Dados da relação 1:1 (string para campos de data) ======
            const opCreateData: Prisma.BeneficiarioOperadoraCreateWithoutBeneficiarioInput = {
              empresa: r['Empresa'] ?? null,
              cpfOperadora: cpfTitularCsv || null,
              usuario: r['Usuario'] ?? null,
              nomeSocial: r['Nm_Social'] ?? null,
              estadoCivil: r['Estado_Civil'] ?? null,
              dataNascimentoOperadora: toIsoStringOrNull(r['Data_Nascimento']),
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
              cpfDependente: cpfDependenteCsv || null,
              grauParentesco: r['Grau_Parentesco'] ?? null,
              dataCasamento: toIsoStringOrNull(r['Dt_Casamento']),
              nuRegistroPessoaNatural: r['Nu_Registro_Pessoa_Natural'] ?? null,
              cdTabela: r['Cd_Tabela'] ?? null,
              empresaUtilizacao: r['Empresa_Utilizacao'] ?? null,
              dataCancelamento: toIsoStringOrNull(r['Dt_Cancelamento']),
            };

            const opUpdateData: Prisma.BeneficiarioOperadoraUpdateWithoutBeneficiarioInput =
              { ...opCreateData };

            if (!existing) {
              const created = await tx.beneficiario.create({
                data: {
                  ...coreData,
                  operadora: { create: opCreateData },
                },
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

              // Loga definição de valorMensalidade quando veio do preço do plano
              if (coreData.valorMensalidade != null) {
                updatedDetails.push({
                  row: rowNum,
                  id: created.id,
                  cpf: created.cpf,
                  nome: created.nomeCompleto,
                  tipo: created.tipo as any,
                  matchBy: cpf ? 'CPF' : 'NOME_DTNASC',
                  changed: [
                    {
                      scope: 'core',
                      field: 'valorMensalidade',
                      before: null,
                      after: coreData.valorMensalidade,
                    },
                  ],
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
                    upsert: {
                      create: opCreateData,
                      update: opUpdateData,
                    },
                  },
                },
                include: { operadora: true },
              });

              const changed: Diff[] = [];
              const coreFieldsToTrack: (keyof Prisma.BeneficiarioUncheckedCreateInput)[] = [
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
                'valorMensalidade', // <- passa a rastrear também
              ];
              coreFieldsToTrack.forEach((k) => {
                const b = (before as any)?.[k];
                const a = (upd as any)?.[k];
                if (String(b ?? '') !== String(a ?? '')) {
                  changed.push({ scope: 'core', field: String(k), before: b, after: a });
                }
              });

              const opFields = Object.keys(opCreateData);
              opFields.forEach((k) => {
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

            if (cpf) {
              const arr = dupMap.get(cpf) ?? [];
              arr.push(rowNum);
              dupMap.set(cpf, arr);
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
      // aumenta timeout da transação interativa (default 5s) para evitar "expired transaction"
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
