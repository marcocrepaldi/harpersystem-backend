import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BeneficiarioStatus, BeneficiarioTipo, Prisma } from '@prisma/client';
import { FindBeneficiariesQueryDto } from './dto/find-beneficiaries.dto';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import * as Papa from 'papaparse';
import * as xlsx from 'xlsx';

// ---------- Funções Helper ----------

/** Converte data serial do Excel para Date do JavaScript. */
function excelSerialDateToJSDate(excelDate: number): Date | null {
  if (typeof excelDate !== 'number' || isNaN(excelDate)) return null;
  const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
  jsDate.setMinutes(jsDate.getMinutes() + jsDate.getTimezoneOffset());
  return jsDate;
}

/** Normaliza rótulos de colunas (remove acentos, espaços/_, lowercase) para busca flexível. */
function normalizeHeader(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s|_/g, '')
    .toLowerCase();
}

/** Busca valor em um objeto por rótulo (case/acentos/espaços indiferentes). */
function getField(rec: Record<string, any>, label: string) {
  const target = normalizeHeader(label);
  for (const key of Object.keys(rec)) {
    if (normalizeHeader(key) === target) return rec[key];
  }
  return undefined;
}

/** Calcula a idade a partir da data de nascimento. */
function calcularIdade(dataNascimento?: Date | null): number | null {
  if (!dataNascimento || !(dataNascimento instanceof Date)) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - dataNascimento.getFullYear();
  const m = hoje.getMonth() - dataNascimento.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < dataNascimento.getDate())) {
    idade--;
  }
  return idade;
}

@Injectable()
export class BeneficiariesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(clientId: string, query: FindBeneficiariesQueryDto) {
    const clientExists = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!clientExists) throw new NotFoundException(`Cliente com ID ${clientId} não encontrado.`);

    const where: Prisma.BeneficiarioWhereInput = { clientId };

    if (query.tipo) {
      where.tipo = query.tipo;
    }

    if (query.search) {
      where.OR = [
        { nomeCompleto: { contains: query.search, mode: 'insensitive' } },
        { cpf: { contains: query.search } },
      ];
    }
    
    // Para a view hierárquica, não aplicamos paginação aqui, mas sim no frontend se necessário.
    const items = await this.prisma.beneficiario.findMany({
      where,
      orderBy: [{ nomeCompleto: 'asc' }],
      take: 1000, // Limite de segurança para evitar sobrecarga
    });

    const mappedItems = items.map((b) => ({
      id: b.id,
      nomeCompleto: b.nomeCompleto,
      cpf: b.cpf,
      tipo: b.tipo === 'TITULAR' ? 'Titular' : 'Dependente',
      valorMensalidade: b.valorMensalidade ? Number(b.valorMensalidade) : null,
      status: b.status === BeneficiarioStatus.ATIVO ? 'Ativo' : 'Inativo',
      titularId: b.titularId,
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
    if (dto.tipo === 'DEPENDENTE' && !dto.titularId) {
      throw new BadRequestException('Para Dependentes, o ID do titular é obrigatório.');
    }
    if (dto.tipo === 'DEPENDENTE' && dto.titularId) {
      const titularExists = await this.prisma.beneficiario.findFirst({
        where: { id: dto.titularId, clientId, tipo: 'TITULAR' },
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
        tipo: dto.tipo,
        dataEntrada: new Date(dto.dataEntrada),
        status: 'ATIVO',
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
        valorMensalidade: dto.valorMensalidade ? parseFloat(dto.valorMensalidade) : undefined,
      },
    });
  }

  async processUpload(clientId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');

    let records: any[];
    try {
      if (file.mimetype.includes('csv')) {
        records = Papa.parse(file.buffer.toString('utf-8'), { header: true, skipEmptyLines: true }).data;
      } else if (file.mimetype.includes('spreadsheetml')) {
        const workbook = xlsx.read(file.buffer, { type: 'buffer' });
        records = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      } else {
        throw new BadRequestException(`Tipo de arquivo não suportado: ${file.mimetype}`);
      }
    } catch (error) {
      throw new BadRequestException('Falha ao ler o arquivo. Verifique o formato.');
    }

    let created = 0, updated = 0, inactivated = 0;
    const errors: { line: number; message: string; data: any }[] = [];
    const COLUMN_MAP = {
      nome: 'NOME DO BENEFICIARIO', cpf: 'CPF', parentesco: 'TIPO', dataInicio: 'VIGENCIA',
      valorMensalidade: 'VALOR PLANO', matricula: 'MATRÍCULA', carteirinha: 'CARTEIRINHA',
      sexo: 'SEXO', dataNascimento: 'DATA DE NASCIMENTO', plano: 'PLANO', centroCusto: 'CENTRO DE CUSTO',
      faixaEtaria: 'FAIXA ETÁRIA', estado: 'ESTADO', contrato: 'CONTRATO', comentario: 'AÇÃO',
    };

    const titularesMap = new Map<string, string>();

    await this.prisma.$transaction(async (tx) => {
      // ETAPA 1: Processar TITULARES
      for (const [index, record] of records.entries()) {
        const parentesco = String(getField(record, COLUMN_MAP.parentesco) ?? '').trim().toUpperCase();

        if (parentesco.startsWith('TITULAR')) {
          const nome = getField(record, COLUMN_MAP.nome);
          const cpf = getField(record, COLUMN_MAP.cpf);
          const matricula = getField(record, COLUMN_MAP.matricula);
          const comentario = getField(record, COLUMN_MAP.comentario);

          if (!nome || !cpf || !matricula) continue;
          
          const cpfLimpo = String(cpf).replace(/\D/g, '');
          if (cpfLimpo.length !== 11) continue;

          const dataEntrada = excelSerialDateToJSDate(Number(getField(record, COLUMN_MAP.dataInicio)));
          if (!dataEntrada) continue; // Pula a linha se a data de entrada for inválida

          const dataPayload = {
            nomeCompleto: String(nome).trim(),
            tipo: BeneficiarioTipo.TITULAR,
            dataEntrada,
            valorMensalidade: getField(record, COLUMN_MAP.valorMensalidade) ? parseFloat(String(getField(record, COLUMN_MAP.valorMensalidade))) : undefined,
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
            status: comentario?.toUpperCase().includes('EXCLUSÃO') ? BeneficiarioStatus.INATIVO : BeneficiarioStatus.ATIVO,
            dataSaida: comentario?.toUpperCase().includes('EXCLUSÃO') ? new Date() : null,
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
      }

      // ETAPA 2: Processar DEPENDENTES
      for (const [index, record] of records.entries()) {
        const parentesco = String(getField(record, COLUMN_MAP.parentesco) ?? '').trim().toUpperCase();

        if (!parentesco.startsWith('TITULAR')) {
          const nome = getField(record, COLUMN_MAP.nome);
          const cpf = getField(record, COLUMN_MAP.cpf);
          const matriculaTitular = getField(record, COLUMN_MAP.matricula);
          const comentario = getField(record, COLUMN_MAP.comentario);

          if (!nome || !cpf || !matriculaTitular) {
            if (Object.keys(record).length > 2) errors.push({ line: index + 2, message: 'Dados insuficientes para dependente', data: record });
            continue;
          }
          
          const cpfLimpo = String(cpf).replace(/\D/g, '');
          const titularId = titularesMap.get(String(matriculaTitular));

          if (!titularId) {
            errors.push({ line: index + 2, message: `Titular com matrícula ${String(matriculaTitular)} não encontrado.`, data: record });
            continue;
          }
          
          const dataEntrada = excelSerialDateToJSDate(Number(getField(record, COLUMN_MAP.dataInicio)));
          if (!dataEntrada) continue;

          const dataPayload = {
            nomeCompleto: String(nome).trim(),
            tipo: BeneficiarioTipo.DEPENDENTE,
            dataEntrada,
            valorMensalidade: getField(record, COLUMN_MAP.valorMensalidade) ? parseFloat(String(getField(record, COLUMN_MAP.valorMensalidade))) : undefined,
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
            status: comentario?.toUpperCase().includes('EXCLUSÃO') ? BeneficiarioStatus.INATIVO : BeneficiarioStatus.ATIVO,
            dataSaida: comentario?.toUpperCase().includes('EXCLUSÃO') ? new Date() : null,
          };

          const existing = await tx.beneficiario.findUnique({ where: { clientId_cpf: { clientId, cpf: cpfLimpo } } });
          await tx.beneficiario.upsert({
            where: { clientId_cpf: { clientId, cpf: cpfLimpo } },
            update: { ...dataPayload, titular: { connect: { id: titularId } } },
            create: { ...dataPayload, cliente: { connect: { id: clientId } }, cpf: cpfLimpo, titular: { connect: { id: titularId } } },
          });
          
          if (existing) updated++; else created++;
          if (dataPayload.status === BeneficiarioStatus.INATIVO) inactivated++;
        }
      }
    });
    
    return { created, updated, inactivated, errors, total: records.length };
  }

  async remove(clientId: string, beneficiaryId: string) {
    const beneficiary = await this.prisma.beneficiario.findFirst({ where: { id: beneficiaryId, clientId } });
    if (!beneficiary) throw new NotFoundException(`Beneficiário com ID ${beneficiaryId} não encontrado.`);
    await this.prisma.beneficiario.delete({ where: { id: beneficiaryId } });
    return { message: 'Beneficiário excluído com sucesso.' };
  }

  async removeMany(clientId: string, dto: { ids: string[] }) {
    const { count } = await this.prisma.beneficiario.deleteMany({ where: { id: { in: dto.ids }, clientId } });
    return { deletedCount: count };
  }

    /**
   * Busca um único beneficiário por ID, garantindo que ele pertence ao cliente.
   */
  async findOne(clientId: string, beneficiaryId: string) {
    const beneficiary = await this.prisma.beneficiario.findFirst({
      where: { id: beneficiaryId, clientId },
    });

    if (!beneficiary) {
      throw new NotFoundException(`Beneficiário com ID ${beneficiaryId} não encontrado para este cliente.`);
    }
    return beneficiary;
  }

  /**
   * Atualiza os dados de um beneficiário.
   */
  async update(clientId: string, beneficiaryId: string, dto: UpdateBeneficiaryDto) {
    // Garante que o beneficiário existe e pertence ao cliente antes de atualizar
    await this.findOne(clientId, beneficiaryId);

    return this.prisma.beneficiario.update({
      where: { id: beneficiaryId },
      data: {
        ...dto,
        // Converte os campos de data e número que vêm como string do DTO
        dataEntrada: dto.dataEntrada ? new Date(dto.dataEntrada) : undefined,
        dataNascimento: dto.dataNascimento ? new Date(dto.dataNascimento) : undefined,
        valorMensalidade: dto.valorMensalidade ? parseFloat(dto.valorMensalidade) : undefined,
      },
    });
  }
}