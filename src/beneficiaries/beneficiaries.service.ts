import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BeneficiarioStatus, BeneficiarioTipo, Prisma } from '@prisma/client';
import { FindBeneficiariesQueryDto } from './dto/find-beneficiaries.dto';
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
        where, skip, take: limit,
        orderBy: [{ tipo: 'asc' }, { nomeCompleto: 'asc' }],
      }),
      this.prisma.beneficiario.count({ where }),
    ]);

    const mappedItems = items.map((b) => ({
      id: b.id,
      nomeCompleto: b.nomeCompleto,
      cpf: b.cpf,
      tipo: b.tipo === 'TITULAR' ? 'Titular' : 'Dependente',
      valorMensalidade: b.valorMensalidade ? Number(b.valorMensalidade) : null,
      status: b.status === BeneficiarioStatus.ATIVO ? 'Ativo' : 'Inativo',
      titularId: b.titularId,
    }));

    return { items: mappedItems, page, limit, total };
  }

  async processUpload(clientId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }

    let records: any[];

    try {
      if (file.mimetype === 'text/csv') {
        const csvContent = file.buffer.toString('utf-8');
        records = Papa.parse(csvContent, { header: true, skipEmptyLines: true }).data;
      } else if (
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel'
      ) {
        const workbook = xlsx.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        records = xlsx.utils.sheet_to_json(worksheet);
      } else {
        throw new BadRequestException(`Tipo de arquivo não suportado: ${file.mimetype}`);
      }
    } catch (error) {
      throw new BadRequestException('Falha ao ler o arquivo. Verifique o formato e o conteúdo.');
    }

    let created = 0;
    let updated = 0;
    const errors: { line: number; message: string; data: any }[] = [];

    const COLUMN_MAP = {
      nome: 'NOME DO BENEFICIARIO',
      cpf: 'CPF',
      parentesco: 'TIPO',
      dataInicio: 'VIGENCIA',
      valorMensalidade: 'VALOR PLANO',
    };
    
    await this.prisma.$transaction(async (tx) => {
      for (const [index, record] of records.entries()) {
        const lineNumber = index + 2;
        
        const cleanRecord = Object.fromEntries(
            Object.entries(record).map(([key, value]) => [key.trim(), value])
        );

        const nome = cleanRecord[COLUMN_MAP.nome];
        const cpf = cleanRecord[COLUMN_MAP.cpf];
        const parentesco = cleanRecord[COLUMN_MAP.parentesco];
        const vigencia = cleanRecord[COLUMN_MAP.dataInicio];
        const valorMensalidade = cleanRecord[COLUMN_MAP.valorMensalidade];

        if (!nome || !cpf) {
          if(Object.keys(cleanRecord).length > 2)
            errors.push({ line: lineNumber, message: 'Nome ou CPF ausente.', data: cleanRecord });
          continue;
        }

        const cpfLimpo = String(cpf).replace(/\D/g, '');
        if (cpfLimpo.length !== 11) {
          errors.push({ line: lineNumber, message: `CPF inválido: ${cpf}`, data: cleanRecord });
          continue;
        }

        const dataEntrada = excelSerialDateToJSDate(Number(vigencia));
        if (!dataEntrada) {
          errors.push({ line: lineNumber, message: `Data de Vigência inválida: ${vigencia}`, data: cleanRecord });
          continue;
        }
        
        const tipo = String(parentesco)?.trim().toUpperCase().startsWith('TITULAR') ? BeneficiarioTipo.TITULAR : BeneficiarioTipo.DEPENDENTE;
        
        try {
          const existing = await tx.beneficiario.findUnique({
            where: { clientId_cpf: { clientId, cpf: cpfLimpo } },
            select: { id: true }
          });
          
          await tx.beneficiario.upsert({
            where: { clientId_cpf: { clientId, cpf: cpfLimpo } },
            update: {
              nomeCompleto: String(nome).trim(),
              tipo,
              dataEntrada,
              valorMensalidade: valorMensalidade ? parseFloat(String(valorMensalidade)) : undefined,
              status: BeneficiarioStatus.ATIVO,
            },
            create: {
              cliente: { connect: { id: clientId } },
              nomeCompleto: String(nome).trim(),
              cpf: cpfLimpo,
              tipo,
              dataEntrada,
              valorMensalidade: valorMensalidade ? parseFloat(String(valorMensalidade)) : undefined,
              status: BeneficiarioStatus.ATIVO,
            },
          });

          if (existing) {
            updated++;
          } else {
            created++;
          }

        } catch (e) {
          console.error(`Erro na linha ${lineNumber}:`, e);

          errors.push({ line: lineNumber, message: `Erro ao salvar no banco.`, data: cleanRecord });
        }
      }
    });

    return { created, updated, errors, total: records.length };
  }
}