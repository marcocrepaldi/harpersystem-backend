import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BeneficiarioStatus, BeneficiarioTipo, Prisma } from '@prisma/client';
import { FindBeneficiariesQueryDto } from './dto/find-beneficiaries.dto';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import * as Papa from 'papaparse';
import * as xlsx from 'xlsx';

/* ======================= Helpers ======================= */

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

  // fallback: qualquer coisa não titular cai em FILHO
  return BeneficiarioTipo.FILHO;
}

/** Label amigável para o front */
function tipoLabel(t: BeneficiarioTipo): 'Titular' | 'Filho' | 'Cônjuge' {
  switch (t) {
    case BeneficiarioTipo.TITULAR:
      return 'Titular';
    case BeneficiarioTipo.FILHO:
      return 'Filho';
    case BeneficiarioTipo.CONJUGE:
      return 'Cônjuge';
  }
}

/* ======================= Service ======================= */

@Injectable()
export class BeneficiariesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(clientId: string, query: FindBeneficiariesQueryDto) {
    const clientExists = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!clientExists) throw new NotFoundException(`Cliente com ID ${clientId} não encontrado.`);

    const where: Prisma.BeneficiarioWhereInput = { clientId };

    // Aceita novos valores e também "DEPENDENTE" legado
    if (query.tipo) {
      const t = String(query.tipo).toUpperCase();
      if (t === 'DEPENDENTE') {
        where.tipo = { in: [BeneficiarioTipo.FILHO, BeneficiarioTipo.CONJUGE] };
      } else if (t === 'TITULAR' || t === 'FILHO' || t === 'CONJUGE') {
        where.tipo = t as BeneficiarioTipo;
      }
    }

    if (query.search) {
      where.OR = [
        { nomeCompleto: { contains: query.search, mode: 'insensitive' } },
        { cpf: { contains: query.search } },
      ];
    }

    // ⚠️ Não filtramos por tipo aqui — assim titulares e dependentes vêm juntos
    const items = await this.prisma.beneficiario.findMany({
      where,
      orderBy: [{ tipo: 'asc' }, { nomeCompleto: 'asc' }], // TITULAR primeiro (opcional)
      take: 1000,
      include: {
        titular: { select: { id: true, nomeCompleto: true } }, // para exibir "Titular" no front
      },
    });

    const mappedItems = items.map((b) => ({
      id: b.id,
      nomeCompleto: b.nomeCompleto,
      cpf: b.cpf,
      tipo: tipoLabel(b.tipo),
      // dentro do mappedItems em findMany()
      valorMensalidade: b.valorMensalidade != null ? Number(b.valorMensalidade) : null,
      status: b.status === BeneficiarioStatus.ATIVO ? 'Ativo' : 'Inativo',
      titularId: b.titularId,
      titularNome: b.titular?.nomeCompleto ?? null,
      matricula: b.matricula,
      carteirinha: b.carteirinha,
      sexo: b.sexo,
      dataNascimento: b.dataNascimento?.toISOString().substring(0, 10),
      dataEntrada: b.dataEntrada.toISOString().substring(0, 10),
      plano: b.plano,
      centroCusto: b.centroCusto,
      faixaEtaria: b.faixaEtaria,
      estado: b.estado,
      contrato: b.contrato,
      comentario: b.comentario,
      idade: calcularIdade(b.dataNascimento),
    }));

    return { items: mappedItems, page: 1, limit: items.length, total: items.length };
  }

  async create(clientId: string, dto: CreateBeneficiaryDto) {
    // Com o novo enum, toda pessoa NÃO TITULAR precisa de titularId
    if (dto.tipo !== 'TITULAR' && !dto.titularId) {
      throw new BadRequestException('Para filhos/cônjuges, o ID do titular é obrigatório.');
    }
    if (dto.tipo !== 'TITULAR' && dto.titularId) {
      const titularExists = await this.prisma.beneficiario.findFirst({
        where: { id: dto.titularId, clientId, tipo: BeneficiarioTipo.TITULAR },
      });
      if (!titularExists) {
        throw new BadRequestException(`Titular com ID ${dto.titularId} não encontrado para este cliente.`);
      }
    }

    if (dto.cpf) {
      const cpfLimpo = dto.cpf.replace(/\D/g, '');
      if (cpfLimpo) {
        const cpfExists = await this.prisma.beneficiario.findUnique({
          where: { clientId_cpf: { clientId, cpf: cpfLimpo } },
        });
        if (cpfExists) {
          throw new BadRequestException(`Um beneficiário com o CPF ${dto.cpf} já existe para este cliente.`);
        }
      }
    }

    return this.prisma.beneficiario.create({
      data: {
        cliente: { connect: { id: clientId } },
        titular: dto.titularId ? { connect: { id: dto.titularId } } : undefined,
        nomeCompleto: dto.nomeCompleto,
        cpf: dto.cpf?.replace(/\D/g, ''),
        tipo: dto.tipo as BeneficiarioTipo,
        dataEntrada: new Date(dto.dataEntrada),
        status: BeneficiarioStatus.ATIVO,
        matricula: dto.matricula,
        carteirinha: dto.carteirinha,
        sexo: dto.sexo,
        dataNascimento: dto.dataNascimento ? new Date(dto.dataNascimento) : undefined,
        plano: dto.plano,
        centroCusto: dto.centroCusto,
        faixaEtaria: dto.faixaEtaria,
        estado: dto.estado,
        contrato: dto.contrato,
        comentario: dto.comentario,
        valorMensalidade: toNumberLoose(dto.valorMensalidade),
      },
    });
  }

  /* =================== Importação em massa =================== */

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

    let created = 0, updated = 0, inactivated = 0;
    const errors: { line: number; message: string; data: any }[] = [];

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
    };

    const titularesMap = new Map<string, string>();

    await this.prisma.$transaction(async (tx) => {
      // 1) TITULARES
      for (const [index, record] of records.entries()) {
        const tipoCsv = mapParentescoToTipo(getField(record, COLUMN_MAP.parentesco));
        if (tipoCsv !== BeneficiarioTipo.TITULAR) continue;

        const nome = getField(record, COLUMN_MAP.nome);
        const cpf = getField(record, COLUMN_MAP.cpf);
        const matricula = getField(record, COLUMN_MAP.matricula);
        const comentario = getField(record, COLUMN_MAP.comentario);

        if (!nome || !cpf || !matricula) continue;

        const cpfLimpo = String(cpf).replace(/\D/g, '');
        if (cpfLimpo.length !== 11) continue;

        const dataEntrada = excelSerialDateToJSDate(Number(getField(record, COLUMN_MAP.dataInicio)));
        if (!dataEntrada) continue;

        const dataPayload = {
          nomeCompleto: String(nome).trim(),
          tipo: BeneficiarioTipo.TITULAR,
          dataEntrada,
          valorMensalidade: toNumberLoose(getField(record, COLUMN_MAP.valorMensalidade)),
          matricula: String(matricula),
          carteirinha: String(getField(record, COLUMN_MAP.carteirinha) ?? ''),
          sexo: String(getField(record, COLUMN_MAP.sexo) ?? '').toUpperCase(),
          dataNascimento: excelSerialDateToJSDate(Number(getField(record, COLUMN_MAP.dataNascimento))),
          plano: String(getField(record, COLUMN_MAP.plano) ?? ''),
          centroCusto: String(getField(record, COLUMN_MAP.centroCusto) ?? ''),
          faixaEtaria: String(getField(record, COLUMN_MAP.faixaEtaria) ?? ''),
          estado: String(getField(record, COLUMN_MAP.estado) ?? ''),
          contrato: String(getField(record, COLUMN_MAP.contrato) ?? ''),
          comentario: String(comentario ?? ''),
          status:
            (String(comentario ?? '').toUpperCase().includes('EXCLUSAO') ||
              String(comentario ?? '').toUpperCase().includes('EXCLUSÃO'))
              ? BeneficiarioStatus.INATIVO
              : BeneficiarioStatus.ATIVO,
          dataSaida:
            (String(comentario ?? '').toUpperCase().includes('EXCLUSAO') ||
              String(comentario ?? '').toUpperCase().includes('EXCLUSÃO'))
              ? new Date()
              : null,
        };

        const existing = await tx.beneficiario.findUnique({ where: { clientId_cpf: { clientId, cpf: cpfLimpo } } });
        const upsertedTitular = await tx.beneficiario.upsert({
          where: { clientId_cpf: { clientId, cpf: cpfLimpo } },
          update: dataPayload,
          create: { ...dataPayload, cliente: { connect: { id: clientId } }, cpf: cpfLimpo },
        });

        if (existing) updated++; else created++;
        if (dataPayload.status === BeneficiarioStatus.INATIVO) inactivated++;
        titularesMap.set(String(matricula), upsertedTitular.id);
      }

      // 2) Dependentes (FILHO / CONJUGE)
      for (const [index, record] of records.entries()) {
        const tipoCsv = mapParentescoToTipo(getField(record, COLUMN_MAP.parentesco));
        if (!tipoCsv || tipoCsv === BeneficiarioTipo.TITULAR) continue;

        const nome = getField(record, COLUMN_MAP.nome);
        const cpf = getField(record, COLUMN_MAP.cpf);
        const matriculaTitular = getField(record, COLUMN_MAP.matricula);
        const comentario = getField(record, COLUMN_MAP.comentario);

        if (!nome || !cpf || !matriculaTitular) {
          if (Object.keys(record).length > 2)
            errors.push({ line: index + 2, message: 'Dados insuficientes para dependente', data: record });
          continue;
        }

        const cpfLimpo = String(cpf).replace(/\D/g, '');
        const titularId = titularesMap.get(String(matriculaTitular));
        if (!titularId) {
          errors.push({
            line: index + 2,
            message: `Titular com matrícula ${String(matriculaTitular)} não encontrado.`,
            data: record,
          });
          continue;
        }

        const dataEntrada = excelSerialDateToJSDate(Number(getField(record, COLUMN_MAP.dataInicio)));
        if (!dataEntrada) continue;

        const dataPayload = {
          nomeCompleto: String(nome).trim(),
          tipo: tipoCsv,
          dataEntrada,
          valorMensalidade: toNumberLoose(getField(record, COLUMN_MAP.valorMensalidade)),
          matricula: String(matriculaTitular),
          carteirinha: String(getField(record, COLUMN_MAP.carteirinha) ?? ''),
          sexo: String(getField(record, COLUMN_MAP.sexo) ?? '').toUpperCase(),
          dataNascimento: excelSerialDateToJSDate(Number(getField(record, COLUMN_MAP.dataNascimento))),
          plano: String(getField(record, COLUMN_MAP.plano) ?? ''),
          centroCusto: String(getField(record, COLUMN_MAP.centroCusto) ?? ''),
          faixaEtaria: String(getField(record, COLUMN_MAP.faixaEtaria) ?? ''),
          estado: String(getField(record, COLUMN_MAP.estado) ?? ''),
          contrato: String(getField(record, COLUMN_MAP.contrato) ?? ''),
          comentario: String(comentario ?? ''),
          status:
            (String(comentario ?? '').toUpperCase().includes('EXCLUSAO') ||
              String(comentario ?? '').toUpperCase().includes('EXCLUSÃO'))
              ? BeneficiarioStatus.INATIVO
              : BeneficiarioStatus.ATIVO,
          dataSaida:
            (String(comentario ?? '').toUpperCase().includes('EXCLUSAO') ||
              String(comentario ?? '').toUpperCase().includes('EXCLUSÃO'))
              ? new Date()
              : null,
        };

        const existing = await tx.beneficiario.findUnique({ where: { clientId_cpf: { clientId, cpf: cpfLimpo } } });
        await tx.beneficiario.upsert({
          where: { clientId_cpf: { clientId, cpf: cpfLimpo } },
          update: { ...dataPayload, titular: { connect: { id: titularId } } },
          create: {
            ...dataPayload,
            cliente: { connect: { id: clientId } },
            cpf: cpfLimpo,
            titular: { connect: { id: titularId } },
          },
        });

        if (existing) updated++; else created++;
        if (dataPayload.status === BeneficiarioStatus.INATIVO) inactivated++;
      }
    });

    return { created, updated, inactivated, errors, total: records.length };
  }

  /* =================== CRUD simples =================== */

  async remove(clientId: string, beneficiaryId: string) {
    const beneficiary = await this.prisma.beneficiario.findFirst({ where: { id: beneficiaryId, clientId } });
    if (!beneficiary) throw new NotFoundException(`Beneficiário com ID ${beneficiaryId} não encontrado.`);
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
    if (dto.tipo && dto.tipo !== 'TITULAR' && !dto.titularId) {
      throw new BadRequestException('Para filhos/cônjuges, o ID do titular é obrigatório.');
    }
    return this.prisma.beneficiario.update({
      where: { id: beneficiaryId },
      data: {
        ...dto,
        dataEntrada: dto.dataEntrada ? new Date(dto.dataEntrada) : undefined,
        dataNascimento: dto.dataNascimento ? new Date(dto.dataNascimento) : undefined,
        valorMensalidade: toNumberLoose(dto.valorMensalidade),
      },
    });
  }
}
