import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BeneficiarioStatus, BeneficiarioTipo, Prisma } from '@prisma/client';
import { FindBeneficiariesQueryDto } from './dto/find-beneficiaries.dto';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import * as Papa from 'papaparse';
import * as xlsx from 'xlsx';

/**
 * Converte a data serial do Excel (um número) para um objeto Date do JavaScript.
 */
function excelSerialDateToJSDate(excelDate: number): Date | null {
  if (typeof excelDate !== 'number' || isNaN(excelDate)) {
    return null;
  }
  const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
  jsDate.setMinutes(jsDate.getMinutes() + jsDate.getTimezoneOffset());
  return jsDate;
}

@Injectable()
export class BeneficiariesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca e formata os beneficiários para a tabela do frontend.
   */
  async findMany(clientId: string, query: FindBeneficiariesQueryDto) {
    const clientExists = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!clientExists) {
      throw new NotFoundException(`Cliente com ID ${clientId} não encontrado.`);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.BeneficiarioWhereInput = {
      clientId,
      tipo: query.tipo,
      ...(query.search
        ? {
            OR: [
              { nomeCompleto: { contains: query.search, mode: 'insensitive' } },
              { cpf: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.beneficiario.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ tipo: 'asc' }, { nomeCompleto: 'asc' }],
      }),
      this.prisma.beneficiario.count({ where }),
    ]);

    // ✅ REVISÃO: Mapeando TODOS os campos para o frontend
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
      plano: b.plano,
      centroCusto: b.centroCusto,
    }));

    return { items: mappedItems, page, limit, total };
  }

  /**
   * Cria um novo beneficiário com todos os campos detalhados.
   */
  async create(clientId: string, dto: CreateBeneficiaryDto) {
    if (dto.tipo === 'DEPENDENTE' && !dto.titularId) {
      throw new BadRequestException('Para Dependentes, o ID do titular é obrigatório.');
    }
    if (dto.tipo === 'DEPENDENTE' && dto.titularId) {
      const titularExists = await this.prisma.beneficiario.findFirst({
        where: { id: dto.titularId, clientId, tipo: 'TITULAR' },
      });
      if (!titularExists) {
        throw new BadRequestException(`Titular com ID ${dto.titularId} não encontrado.`);
      }
    }
    if (dto.cpf) {
      const cpfLimpo = dto.cpf.replace(/\D/g, '');
      const cpfExists = await this.prisma.beneficiario.findUnique({
        where: { clientId_cpf: { clientId, cpf: cpfLimpo } },
      });
      if (cpfExists) {
        throw new BadRequestException(`Um beneficiário com o CPF ${dto.cpf} já existe.`);
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
        valorMensalidade: dto.valorMensalidade ? parseFloat(dto.valorMensalidade) : undefined,
        status: 'ATIVO',
        matricula: dto.matricula,
        carteirinha: dto.carteirinha,
        sexo: dto.sexo,
        dataNascimento: dto.dataNascimento ? new Date(dto.dataNascimento) : undefined,
        plano: dto.plano,
        centroCusto: dto.centroCusto,
      },
    });
  }

  /**
   * Processa um arquivo (CSV ou XLSX) de beneficiários e os salva no banco de dados.
   */
  async processUpload(clientId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');

    let records: any[];
    try {
      if (file.mimetype === 'text/csv') {
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

    let created = 0, updated = 0;
    const errors: { line: number; message: string; data: any }[] = [];
    const COLUMN_MAP = {
      nome: 'NOME DO BENEFICIARIO', cpf: 'CPF', parentesco: 'TIPO', dataInicio: 'VIGENCIA',
      valorMensalidade: 'VALOR PLANO', matricula: 'MATRÍCULA', carteirinha: 'CARTEIRINHA',
      sexo: 'SEXO', dataNascimento: 'DATA DE NASCIMENTO', plano: 'PLANO', centroCusto: 'CENTRO DE CUSTO',
    };

    await this.prisma.$transaction(async (tx) => {
      for (const [index, record] of records.entries()) {
        const lineNumber = index + 2;
        const cleanRecord = Object.fromEntries(Object.entries(record).map(([k, v]) => [k.trim(), v]));

        const nome = cleanRecord[COLUMN_MAP.nome];
        const cpf = cleanRecord[COLUMN_MAP.cpf];
        if (!nome || !cpf) {
          if(Object.keys(cleanRecord).length > 2) errors.push({ line: lineNumber, message: 'Nome ou CPF ausente.', data: cleanRecord });
          continue;
        }

        const cpfLimpo = String(cpf).replace(/\D/g, '');
        if (cpfLimpo.length !== 11) {
          errors.push({ line: lineNumber, message: `CPF inválido: ${cpf}`, data: cleanRecord });
          continue;
        }

        const dataEntrada = excelSerialDateToJSDate(Number(cleanRecord[COLUMN_MAP.dataInicio]));
        if (!dataEntrada) {
          errors.push({ line: lineNumber, message: `Data de Vigência inválida.`, data: cleanRecord });
          continue;
        }

        const dataPayload = {
          nomeCompleto: String(nome).trim(),
          tipo: String(cleanRecord[COLUMN_MAP.parentesco])?.trim().toUpperCase().startsWith('TITULAR') ? BeneficiarioTipo.TITULAR : BeneficiarioTipo.DEPENDENTE,
          dataEntrada,
          valorMensalidade: cleanRecord[COLUMN_MAP.valorMensalidade] ? parseFloat(String(cleanRecord[COLUMN_MAP.valorMensalidade])) : undefined,
          matricula: cleanRecord[COLUMN_MAP.matricula] ? String(cleanRecord[COLUMN_MAP.matricula]) : undefined,
          carteirinha: cleanRecord[COLUMN_MAP.carteirinha] ? String(cleanRecord[COLUMN_MAP.carteirinha]) : undefined,
          sexo: cleanRecord[COLUMN_MAP.sexo] ? String(cleanRecord[COLUMN_MAP.sexo]).toUpperCase() : undefined,
          dataNascimento: excelSerialDateToJSDate(Number(cleanRecord[COLUMN_MAP.dataNascimento])),
          plano: cleanRecord[COLUMN_MAP.plano] ? String(cleanRecord[COLUMN_MAP.plano]) : undefined,
          centroCusto: cleanRecord[COLUMN_MAP.centroCusto] ? String(cleanRecord[COLUMN_MAP.centroCusto]) : undefined,
          status: BeneficiarioStatus.ATIVO,
        };

        try {
          const existing = await tx.beneficiario.findUnique({ where: { clientId_cpf: { clientId, cpf: cpfLimpo } } });
          await tx.beneficiario.upsert({
            where: { clientId_cpf: { clientId, cpf: cpfLimpo } },
            update: dataPayload,
            create: { ...dataPayload, cliente: { connect: { id: clientId } }, cpf: cpfLimpo },
          });
          if (existing) updated++; else created++;
        } catch (e) {
          errors.push({ line: lineNumber, message: `Erro ao salvar no banco.`, data: cleanRecord });
        }
      }
    });

    return { created, updated, errors, total: records.length };
  }
}