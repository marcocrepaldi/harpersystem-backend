// src/beneficiaries/beneficiaries.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BeneficiarioStatus,
  BeneficiarioTipo,
  Prisma,
  RegimeCobranca,
  MotivoMovimento,
} from '@prisma/client';
import { FindBeneficiariesQueryDto } from './dto/find-beneficiaries.dto';
import { CreateBeneficiaryDto, SexoDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { normalizeCpf, isValidCpf } from '../common/cpf';
import * as Papa from 'papaparse';
import * as xlsx from 'xlsx';

/* ======================= Helpers genéricos ======================= */

function excelSerialDateToJSDate(excelDate: number): Date | null {
  if (typeof excelDate !== 'number' || isNaN(excelDate)) return null;
  const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
  jsDate.setMinutes(jsDate.getMinutes() + jsDate.getTimezoneOffset());
  return jsDate;
}

function normalizeHeader(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s|_/g, '')
    .toLowerCase();
}

function getField(rec: Record<string, any>, label: string) {
  const target = normalizeHeader(label);
  for (const key of Object.keys(rec)) {
    if (normalizeHeader(key) === target) return rec[key];
  }
  return undefined;
}

// aceita "297,81", "297.81" e "297"
function toNumberLoose(v: any): number | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return isNaN(v) ? undefined : v;
  const s = String(v).trim();
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? undefined : n;
}

function calcularIdade(dataNascimento?: Date | null): number | null {
  if (!dataNascimento || !(dataNascimento instanceof Date)) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - dataNascimento.getFullYear();
  const m = hoje.getMonth() - dataNascimento.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < dataNascimento.getDate())) idade--;
  return idade;
}

/** Faixa etária padrão (coerente com o formulário) */
function faixaFromIdade(idade?: number | null): string | undefined {
  if (idade == null || idade < 0) return undefined;
  if (idade <= 18) return '0-18';
  if (idade <= 23) return '19-23';
  if (idade <= 28) return '24-28';
  if (idade <= 33) return '29-33';
  if (idade <= 38) return '34-38';
  if (idade <= 43) return '39-43';
  if (idade <= 48) return '44-48';
  if (idade <= 53) return '49-53';
  if (idade <= 58) return '54-58';
  return '59+';
}

/** Normaliza sexo para 'M' | 'F' ou undefined */
function normalizeSexo(v: any): 'M' | 'F' | undefined {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === 'M' || s === 'F') return s;
  if (['MASC', 'MASCULINO'].includes(s)) return 'M';
  if (['FEM', 'FEMININO'].includes(s)) return 'F';
  return undefined;
}

/** Mapeia texto de parentesco/tipo vindo do arquivo para o enum BeneficiarioTipo */
function mapParentescoToTipo(raw?: any): BeneficiarioTipo | null {
  const v = String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  if (!v) return null;
  if (v.startsWith('TITULAR')) return BeneficiarioTipo.TITULAR;
  if (v.includes('CONJUGE') || v.includes('ESPOSA') || v.includes('ESPOSO') || v.includes('COMPANHEIR')) {
    return BeneficiarioTipo.CONJUGE;
  }
  if (v.includes('FILHO') || v.includes('DEPENDENTE') || v.includes('ENTEAD')) {
    return BeneficiarioTipo.FILHO;
  }
  return BeneficiarioTipo.FILHO;
}

/** Label amigável para o front */
function tipoLabel(t: BeneficiarioTipo): 'Titular' | 'Filho' | 'Cônjuge' {
  switch (t) {
    case BeneficiarioTipo.TITULAR: return 'Titular';
    case BeneficiarioTipo.FILHO: return 'Filho';
    case BeneficiarioTipo.CONJUGE: return 'Cônjuge';
  }
}

/* ======================= Service ======================= */

@Injectable()
export class BeneficiariesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Listagem com filtros e paginação */
/** Listagem com filtros (sem paginação: retorna todos) */
async findMany(clientId: string, query: FindBeneficiariesQueryDto) {
  const clientExists = await this.prisma.client.findUnique({ where: { id: clientId } });
  if (!clientExists) throw new NotFoundException(`Cliente com ID ${clientId} não encontrado.`);

  const where: Prisma.BeneficiarioWhereInput = { clientId };

  if (query.tipo) {
    const t = String(query.tipo).toUpperCase();
    if (t === 'DEPENDENTE') {
      where.tipo = { in: [BeneficiarioTipo.FILHO, BeneficiarioTipo.CONJUGE] };
    } else if (t === 'TITULAR' || t === 'FILHO' || t === 'CONJUGE') {
      where.tipo = t as BeneficiarioTipo;
    }
  }

  if (query.status) where.status = query.status;

  if (query.search) {
    const searchDigits = query.search.replace(/\D/g, '');
    where.OR = [
      { nomeCompleto: { contains: query.search, mode: 'insensitive' } },
      ...(searchDigits ? [{ cpf: { contains: searchDigits } } as Prisma.BeneficiarioWhereInput] : []),
      { carteirinha: { contains: query.search, mode: 'insensitive' } },
      { contrato: { contains: query.search, mode: 'insensitive' } },
      { plano: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  // >>> Sem paginação
  const [total, items] = await this.prisma.$transaction([
    this.prisma.beneficiario.count({ where }),
    this.prisma.beneficiario.findMany({
      where,
      orderBy: [{ tipo: 'asc' }, { nomeCompleto: 'asc' }],
      include: { titular: { select: { id: true, nomeCompleto: true } } },
    }),
  ]);

  const mappedItems = items.map((b) => ({
    id: b.id,
    nomeCompleto: b.nomeCompleto,
    cpf: b.cpf,
    tipo:
      b.tipo === BeneficiarioTipo.TITULAR ? 'Titular' :
      b.tipo === BeneficiarioTipo.FILHO ? 'Filho' : 'Cônjuge',
    valorMensalidade: b.valorMensalidade != null ? Number(b.valorMensalidade) : null,
    status: b.status === BeneficiarioStatus.ATIVO ? 'Ativo' : 'Inativo',
    titularId: b.titularId,
    titularNome: b.titular?.nomeCompleto ?? null,
    matricula: b.matricula,
    carteirinha: b.carteirinha,
    sexo: (b.sexo as 'M' | 'F' | null) ?? null,
    dataNascimento: b.dataNascimento?.toISOString().substring(0, 10),
    dataEntrada: b.dataEntrada.toISOString().substring(0, 10),
    dataSaida: b.dataSaida?.toISOString().substring(0, 10) ?? null,
    plano: b.plano,
    centroCusto: b.centroCusto,
    faixaEtaria: b.faixaEtaria,
    estado: b.estado,
    contrato: b.contrato,
    comentario: b.comentario,
    regimeCobranca: b.regimeCobranca,
    motivoMovimento: b.motivoMovimento,
    observacoes: b.observacoes ?? null,
    idade: calcularIdade(b.dataNascimento),
  }));

  // Mantém o shape, mas sem paginação real
  return {
    items: mappedItems,
    page: 1,
    limit: items.length,
    total,
  };
}

  /** Criação individual */
  async create(clientId: string, dto: CreateBeneficiaryDto) {
    const tipoUpper = String(dto.tipo).toUpperCase();
    const isTitular = tipoUpper === 'TITULAR';

    if (!isTitular && !dto.titularId) {
      throw new BadRequestException('Para dependentes (FILHO/CONJUGE), o ID do titular é obrigatório.');
    }

    if (!isTitular && dto.titularId) {
      const titularExists = await this.prisma.beneficiario.findFirst({
        where: { id: dto.titularId, clientId, tipo: BeneficiarioTipo.TITULAR },
      });
      if (!titularExists) {
        throw new BadRequestException(`Titular com ID ${dto.titularId} não encontrado para este cliente.`);
      }
    }

    let cpfNorm: string | null = null;
    if (dto.cpf) {
      cpfNorm = normalizeCpf(dto.cpf);
      if (!cpfNorm || !isValidCpf(cpfNorm)) {
        throw new BadRequestException(`CPF inválido: ${dto.cpf}`);
      }
      const cpfExists = await this.prisma.beneficiario.findUnique({
        where: { clientId_cpf: { clientId, cpf: cpfNorm } },
      });
      if (cpfExists) {
        throw new BadRequestException(`Um beneficiário com o CPF ${dto.cpf} já existe para este cliente.`);
      }
    }

    const dataNasc = dto.dataNascimento ? new Date(dto.dataNascimento) : undefined;
    const faixaAuto = dto.faixaEtaria ?? faixaFromIdade(calcularIdade(dataNasc));

    // Unchecked create (usa FKs escalares em vez de relations)
    const dataToCreate: Prisma.BeneficiarioUncheckedCreateInput = {
      clientId,
      titularId: !isTitular && dto.titularId ? dto.titularId : undefined,
      nomeCompleto: dto.nomeCompleto,
      cpf: cpfNorm ?? undefined,
      tipo: isTitular ? BeneficiarioTipo.TITULAR : (dto.tipo as BeneficiarioTipo),
      dataEntrada: new Date(dto.dataEntrada),
      status: dto.status ?? BeneficiarioStatus.ATIVO,
      dataSaida: dto.dataSaida ? new Date(dto.dataSaida) : undefined,
      matricula: dto.matricula ?? undefined,
      carteirinha: dto.carteirinha ?? undefined,
      sexo: (dto.sexo as SexoDto) ?? undefined,
      dataNascimento: dataNasc ?? undefined,
      plano: dto.plano ?? undefined,
      centroCusto: dto.centroCusto ?? undefined,
      faixaEtaria: faixaAuto ?? undefined,
      estado: dto.estado ?? undefined,
      contrato: dto.contrato ?? undefined,
      comentario: dto.comentario ?? undefined,
      valorMensalidade: toNumberLoose(dto.valorMensalidade),
      regimeCobranca: (dto.regimeCobranca ?? undefined) as RegimeCobranca | undefined,
      motivoMovimento: (dto.motivoMovimento ?? undefined) as MotivoMovimento | undefined,
      observacoes: dto.observacoes ?? undefined,
    };

    return this.prisma.beneficiario.create({ data: dataToCreate });
  }

  /* ----------------- Importação em massa ----------------- */

  private isCsvOrExcel(file: Express.Multer.File) {
    const name = (file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    const isCsv =
      name.endsWith('.csv') ||
      mime.includes('text/csv') ||
      mime.includes('application/csv') ||
      (mime === 'application/vnd.ms-excel' && name.endsWith('.csv'));

    const isExcel =
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      mime.includes('spreadsheetml') ||
      (mime === 'application/vnd.ms-excel' && (name.endsWith('.xls') || name.endsWith('.xlsx')));

    return { isCsv, isExcel, name, mime };
  }

  /** Importação em massa com registro de erros */
/** Importação em massa com registro de erros */
  /** Importação em massa com registro de erros + relatório */
  async processUpload(clientId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    const { isCsv, isExcel, name, mime } = this.isCsvOrExcel(file);

    let records: any[] = [];
    try {
      if (isCsv && !isExcel) {
        records = Papa.parse(file.buffer.toString('utf-8'), {
          header: true,
          skipEmptyLines: true,
        }).data as any[];
      } else if (isExcel) {
        const workbook = xlsx.read(file.buffer, { type: 'buffer' });
        records = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      } else {
        throw new BadRequestException(`Tipo de arquivo não suportado: ${mime} (${name}). Envie CSV, XLS ou XLSX.`);
      }
    } catch {
      throw new BadRequestException('Falha ao ler o arquivo. Verifique o formato.');
    }

    // --- métricas/relatório
    let created = 0, updated = 0;
    let createdTitulares = 0, updatedTitulares = 0, createdDependentes = 0, updatedDependentes = 0;
    const errors: { linha: number; motivo: string; dados: any }[] = [];
    const errorCounts = new Map<string, number>();
    const incErr = (motivo: string) => errorCounts.set(motivo, (errorCounts.get(motivo) ?? 0) + 1);

    // --- colunas esperadas
    const COLUMN_MAP = {
      nome: 'NOME DO BENEFICIARIO',
      cpf: 'CPF',
      parentesco: 'TIPO',
      dataInicio: 'VIGENCIA',
      valorMensalidade: 'VALOR PLANO',
      matricula: 'MATRÍCULA',
      carteirinha: 'CARTEIRINHA',
      sexo: 'SEXO',
      dataNascimento: 'DATA DE NASCIMENTO',
      plano: 'PLANO',
      centroCusto: 'CENTRO DE CUSTO',
      faixaEtaria: 'FAIXA ETÁRIA',
      estado: 'ESTADO',
      contrato: 'CONTRATO',
      comentario: 'AÇÃO',
    } as const;

    // mapeamentos auxiliares
    const titularesMap = new Map<string, string>(); // matrícula -> ID salvo
    const titularesRejeitados = new Map<string, { linha: number; motivo: string }>(); // matrícula -> motivo/linha

    await this.prisma.$transaction(async (tx) => {
      // ================= TITULARES =================
      for (const [index, record] of records.entries()) {
        const tipoCsv = mapParentescoToTipo(getField(record, COLUMN_MAP.parentesco));
        if (tipoCsv !== BeneficiarioTipo.TITULAR) continue;

        const linha = index + 2;
        const nome = getField(record, COLUMN_MAP.nome);
        const cpfRaw = getField(record, COLUMN_MAP.cpf);
        const matricula = getField(record, COLUMN_MAP.matricula);

        if (!nome || !cpfRaw || !matricula) {
          const motivo = 'Campos obrigatórios ausentes';
          errors.push({ linha, motivo, dados: record });
          incErr(motivo);
          titularesRejeitados.set(String(matricula), { linha, motivo });
          continue;
        }

        const cpfNorm = normalizeCpf(cpfRaw);
        if (!cpfNorm || !isValidCpf(cpfNorm)) {
          const motivo = `Titular rejeitado: CPF inválido`;
          errors.push({ linha, motivo, dados: record });
          incErr('CPF inválido');
          titularesRejeitados.set(String(matricula), { linha, motivo });
          continue;
        }

        const dataEntrada = excelSerialDateToJSDate(Number(getField(record, COLUMN_MAP.dataInicio)));
        if (!dataEntrada) {
          const motivo = 'Data de entrada inválida';
          errors.push({ linha, motivo, dados: record });
          incErr(motivo);
          titularesRejeitados.set(String(matricula), { linha, motivo });
          continue;
        }

        const dataNasc = excelSerialDateToJSDate(Number(getField(record, COLUMN_MAP.dataNascimento)));
        const faixaPlanilha = String(getField(record, COLUMN_MAP.faixaEtaria) ?? '').trim() || undefined;
        const faixaCalc = faixaFromIdade(calcularIdade(dataNasc ?? undefined));
        const faixaFinal = faixaPlanilha || faixaCalc;

        const baseUnchecked: Prisma.BeneficiarioUncheckedCreateInput = {
          clientId,
          nomeCompleto: String(nome).trim(),
          cpf: cpfNorm,
          tipo: BeneficiarioTipo.TITULAR,
          dataEntrada,
          status: BeneficiarioStatus.ATIVO,
          valorMensalidade: toNumberLoose(getField(record, COLUMN_MAP.valorMensalidade)),
          matricula: String(matricula),
          carteirinha: String(getField(record, COLUMN_MAP.carteirinha) ?? ''),
          sexo: normalizeSexo(getField(record, COLUMN_MAP.sexo)) ?? undefined,
          dataNascimento: dataNasc ?? undefined,
          plano: String(getField(record, COLUMN_MAP.plano) ?? '') || undefined,
          centroCusto: String(getField(record, COLUMN_MAP.centroCusto) ?? '') || undefined,
          faixaEtaria: faixaFinal ?? undefined,
          estado: String(getField(record, COLUMN_MAP.estado) ?? '') || undefined,
          contrato: String(getField(record, COLUMN_MAP.contrato) ?? '') || undefined,
          comentario: String(getField(record, COLUMN_MAP.comentario) ?? '') || undefined,
        };

        const existing = await tx.beneficiario.findUnique({
          where: { clientId_cpf: { clientId, cpf: cpfNorm } },
        });

        const upsertedTitular = await tx.beneficiario.upsert({
          where: { clientId_cpf: { clientId, cpf: cpfNorm } },
          update: {
            ...baseUnchecked,
            clientId: undefined, // não altere o clientId em updates
          },
          create: { ...baseUnchecked },
        });

        if (existing) {
          updated++; updatedTitulares++;
        } else {
          created++; createdTitulares++;
        }

        // matrícula -> id salvo
        titularesMap.set(String(matricula), upsertedTitular.id);
      }

      // ================= DEPENDENTES =================
      for (const [index, record] of records.entries()) {
        const tipoCsv = mapParentescoToTipo(getField(record, COLUMN_MAP.parentesco));
        if (!tipoCsv || tipoCsv === BeneficiarioTipo.TITULAR) continue;

        const linha = index + 2;
        const nome = getField(record, COLUMN_MAP.nome);
        const cpfRaw = getField(record, COLUMN_MAP.cpf);
        const matriculaTitular = getField(record, COLUMN_MAP.matricula);

        if (!nome || !cpfRaw || !matriculaTitular) {
          const motivo = 'Campos obrigatórios ausentes';
          errors.push({ linha, motivo, dados: record });
          incErr(motivo);
          continue;
        }

        const cpfNorm = normalizeCpf(cpfRaw);
        if (!cpfNorm || !isValidCpf(cpfNorm)) {
          const motivo = 'CPF inválido';
          errors.push({ linha, motivo, dados: record });
          incErr(motivo);
          continue;
        }

        // 1) titular salvo no upload?
        const titularId = titularesMap.get(String(matriculaTitular));
        if (!titularId) {
          // 2) se não, verifique se o titular foi rejeitado e traga motivo/linha
          const rejeitado = titularesRejeitados.get(String(matriculaTitular));
          const motivo = rejeitado
            ? `Titular ${matriculaTitular} rejeitado no upload (linha ${rejeitado.linha}): ${rejeitado.motivo}`
            : `Titular com matrícula ${String(matriculaTitular)} não encontrado.`;
          errors.push({ linha, motivo, dados: record });
          incErr(rejeitado ? 'Titular rejeitado' : 'Titular não encontrado');
          continue;
        }

        const dataEntrada = excelSerialDateToJSDate(Number(getField(record, COLUMN_MAP.dataInicio)));
        if (!dataEntrada) {
          const motivo = 'Data de entrada inválida';
          errors.push({ linha, motivo, dados: record });
          incErr(motivo);
          continue;
        }

        const baseUnchecked: Prisma.BeneficiarioUncheckedCreateInput = {
          clientId,
          titularId,
          nomeCompleto: String(nome).trim(),
          cpf: cpfNorm,
          tipo: tipoCsv,
          dataEntrada,
          status: BeneficiarioStatus.ATIVO,
          valorMensalidade: toNumberLoose(getField(record, COLUMN_MAP.valorMensalidade)),
          matricula: String(matriculaTitular),
          carteirinha: String(getField(record, COLUMN_MAP.carteirinha) ?? ''),
          sexo: normalizeSexo(getField(record, COLUMN_MAP.sexo)) ?? undefined,
          plano: String(getField(record, COLUMN_MAP.plano) ?? '') || undefined,
        };

        const existing = await tx.beneficiario.findUnique({
          where: { clientId_cpf: { clientId, cpf: cpfNorm } },
        });

        await tx.beneficiario.upsert({
          where: { clientId_cpf: { clientId, cpf: cpfNorm } },
          update: { ...baseUnchecked, clientId: undefined },
          create: { ...baseUnchecked },
        });

        if (existing) {
          updated++; updatedDependentes++;
        } else {
          created++; createdDependentes++;
        }
      }

      // Salva os erros no banco (se houver)
      if (errors.length > 0) {
        await tx.beneficiarioImportError.createMany({
          data: errors.map((err) => ({
            clientId,
            linha: err.linha,
            motivo: err.motivo,
            dados: err.dados,
          })),
        });
      }
    });

    // monta resumo de erros
    const porMotivo = Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([motivo, count]) => ({ motivo, count }));

    return {
      ok: true,
      summary: {
        totalLinhas: records.length,
        processados: records.length, // ou created + updated + errors.length
        criados: created,
        atualizados: updated,
        rejeitados: errors.length,
        porMotivo,
        porTipo: {
          titulares: { criados: createdTitulares, atualizados: updatedTitulares },
          dependentes: { criados: createdDependentes, atualizados: updatedDependentes },
        },
      },
      // amostra de erros que o front pode abrir imediatamente no modal
      errors: errors.slice(0, 200),
    };
  }

  /* ----------------- CRUD simples ----------------- */

  async remove(clientId: string, beneficiaryId: string) {
    const beneficiary = await this.prisma.beneficiario.findFirst({
      where: { id: beneficiaryId, clientId },
    });
    if (!beneficiary) {
      throw new NotFoundException(`Beneficiário com ID ${beneficiaryId} não encontrado.`);
    }
    await this.prisma.beneficiario.delete({ where: { id: beneficiaryId } });
    return { message: 'Beneficiário excluído com sucesso.' };
  }

  async removeMany(clientId: string, dto: { ids: string[] }) {
    const { count } = await this.prisma.beneficiario.deleteMany({
      where: { id: { in: dto.ids }, clientId },
    });
    return { deletedCount: count };
  }

  async findOne(clientId: string, beneficiaryId: string) {
    const beneficiary = await this.prisma.beneficiario.findFirst({
      where: { id: beneficiaryId, clientId },
      include: { titular: { select: { id: true, nomeCompleto: true } } },
    });
    if (!beneficiary) {
      throw new NotFoundException(`Beneficiário com ID ${beneficiaryId} não encontrado para este cliente.`);
    }
    return beneficiary;
  }

  async update(clientId: string, beneficiaryId: string, dto: UpdateBeneficiaryDto) {
    if (dto.tipo && String(dto.tipo).toUpperCase() !== 'TITULAR' && !dto.titularId) {
      throw new BadRequestException('Para dependentes (FILHO/CONJUGE), o ID do titular é obrigatório.');
    }

    const dataNasc = dto.dataNascimento ? new Date(dto.dataNascimento) : undefined;
    const faixaAuto = dto.faixaEtaria ?? faixaFromIdade(calcularIdade(dataNasc));

    const cpfNorm = dto.cpf != null ? normalizeCpf(dto.cpf) : undefined;
    if (dto.cpf != null && (!cpfNorm || !isValidCpf(cpfNorm))) {
      throw new BadRequestException(`CPF inválido: ${dto.cpf}`);
    }

    const data: Prisma.BeneficiarioUpdateInput = {
      nomeCompleto: dto.nomeCompleto,
      cpf: cpfNorm,
      tipo: dto.tipo ? (String(dto.tipo).toUpperCase() as keyof typeof BeneficiarioTipo) as BeneficiarioTipo : undefined,
      dataEntrada: dto.dataEntrada ? new Date(dto.dataEntrada) : undefined,
      status: dto.status,
      dataSaida: dto.dataSaida ? new Date(dto.dataSaida) : undefined,
      matricula: dto.matricula ?? undefined,
      carteirinha: dto.carteirinha ?? undefined,
      sexo: (dto.sexo ? normalizeSexo(dto.sexo) : undefined) as any,
      dataNascimento: dataNasc ?? undefined,
      plano: dto.plano ?? undefined,
      centroCusto: dto.centroCusto ?? undefined,
      faixaEtaria: faixaAuto ?? undefined,
      estado: dto.estado ?? undefined,
      contrato: dto.contrato ?? undefined,
      comentario: dto.comentario ?? undefined,
      valorMensalidade: dto.valorMensalidade != null ? toNumberLoose(dto.valorMensalidade) : undefined,
      regimeCobranca: (dto.regimeCobranca as RegimeCobranca) ?? undefined,
      motivoMovimento: (dto.motivoMovimento as MotivoMovimento) ?? undefined,
      observacoes: dto.observacoes ?? undefined,
    };

    if (dto.tipo && String(dto.tipo).toUpperCase() === 'TITULAR') {
      data.titular = { disconnect: true };
    } else if (dto.titularId) {
      const titularExists = await this.prisma.beneficiario.findFirst({
        where: { id: dto.titularId, clientId, tipo: BeneficiarioTipo.TITULAR },
      });
      if (!titularExists) {
        throw new BadRequestException(`Titular com ID ${dto.titularId} não encontrado para este cliente.`);
      }
      data.titular = { connect: { id: dto.titularId } };
    }

    return this.prisma.beneficiario.update({
      where: { id: beneficiaryId },
      data,
    });
  }
}
