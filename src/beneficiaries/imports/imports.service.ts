import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class BeneficiaryImportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria um ImportRun novo como "latest".
   * Estratégia (sem unique no banco):
   * - Em transação: zera latest anteriores do cliente e cria um novo com latest=true.
   */
  async createLatest(clientId: string, payload: any, runId?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.importRun.updateMany({
        where: { clientId, latest: true },
        data: { latest: false },
      });

      const created = await tx.importRun.create({
        data: { clientId, payload, latest: true, runId },
      });

      return created;
    });
  }

  /**
   * Marca um run existente como "latest".
   * - Em transação: zera latest anteriores e seta o desejado.
   */
  async setAsLatest(clientId: string, idOrRunId: string) {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.importRun.findFirst({
        where: {
          clientId,
          OR: [{ id: idOrRunId }, { runId: idOrRunId }],
        },
      });

      if (!run) {
        throw new NotFoundException('ImportRun não encontrado para este cliente.');
      }

      await tx.importRun.updateMany({
        where: { clientId, latest: true },
        data: { latest: false },
      });

      const updated = await tx.importRun.update({
        where: { id: run.id },
        data: { latest: true },
      });

      return updated;
    });
  }

  /**
   * Retorna o último ImportRun (latest=true) do cliente.
   */
  async getLatest(clientId: string) {
    const latest = await this.prisma.importRun.findFirst({
      where: { clientId, latest: true },
      orderBy: { createdAt: 'desc' }, // segurança
    });
    if (!latest) {
      throw new NotFoundException('Ainda não existe importação marcada como latest para este cliente.');
    }
    return latest;
  }

  /**
   * Busca um ImportRun específico (por id interno ou runId externo) do cliente.
   */
  async getByIdOrRunId(clientId: string, idOrRunId: string) {
    const run = await this.prisma.importRun.findFirst({
      where: {
        clientId,
        OR: [{ id: idOrRunId }, { runId: idOrRunId }],
      },
    });
    if (!run) throw new NotFoundException('ImportRun não encontrado.');
    return run;
  }

  /**
   * Remove um ImportRun do cliente.
   * Se apagar o "latest", não promovemos automaticamente outro — fica a critério da UI/fluxo.
   */
  async deleteOne(clientId: string, idOrRunId: string) {
    const run = await this.prisma.importRun.findFirst({
      where: { clientId, OR: [{ id: idOrRunId }, { runId: idOrRunId }] },
    });
    if (!run) throw new NotFoundException('ImportRun não encontrado.');

    await this.prisma.importRun.delete({ where: { id: run.id } });
    return { ok: true, deletedId: run.id };
  }

  /**
   * Limpa TODOS os ImportRuns de um cliente.
   */
  async deleteAll(clientId: string) {
    const { count } = await this.prisma.importRun.deleteMany({ where: { clientId } });
    return { ok: true, count };
  }

  /**
   * Utilitário: lista runs paginados (ajuda no painel).
   */
  async list(clientId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.importRun.count({ where: { clientId } }),
      this.prisma.importRun.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      rows,
    };
  }
}
