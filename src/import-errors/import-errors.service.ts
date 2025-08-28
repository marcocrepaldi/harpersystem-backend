// src/import-errors/import-errors.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FindImportErrorsDto } from './dto/find-import-errors.dto';
import { Prisma } from '@prisma/client';

function toInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

@Injectable()
export class ImportErrorsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista os erros de importação de beneficiários para um cliente */
  async findMany(clientId: string, query: FindImportErrorsDto) {
    // garante que o cliente existe
    const clientExists = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!clientExists) {
      throw new NotFoundException(`Cliente com ID ${clientId} não encontrado.`);
    }

    // Coerção forte para números (caso cheguem como string via querystring)
    const pageRaw = (query as any).page ?? 1;
    const limitRaw = (query as any).limit ?? 50;

    const page = Math.max(1, toInt(pageRaw, 1));
    const limit = Math.min(200, Math.max(1, toInt(limitRaw, 50)));
    const skip = (page - 1) * limit;

    // Monta o where com busca textual em "motivo" e no JSON "dados"
    const where: Prisma.BeneficiarioImportErrorWhereInput = {
      clientId,
      ...(query.search && query.search.trim()
        ? {
            OR: [
              { motivo: { contains: query.search.trim(), mode: 'insensitive' } },
              {
                dados: {
                  // Busca textual dentro do JSON (Postgres): string_contains
                  // path [] => busca em qualquer lugar do JSON
                  path: [],
                  string_contains: query.search.trim(),
                } as any, // anotado como any porque o tipo do JSONFilter no client pode variar por driver
              },
            ],
          }
        : {}),
    };

    // $transaction com COUNT e PAGE
    const [total, items] = await this.prisma.$transaction([
      this.prisma.beneficiarioImportError.count({ where }),
      this.prisma.beneficiarioImportError.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit, // <-- agora garantidamente number
      }),
    ]);

    return {
      items,
      page,
      limit,
      total,
    };
  }

  /** Remove todos os erros de importação de um cliente */
  async clear(clientId: string) {
    const { count } = await this.prisma.beneficiarioImportError.deleteMany({ where: { clientId } });
    return {
      message: `Foram removidos ${count} erros de importação.`,
      deletedCount: count,
    };
  }
}
