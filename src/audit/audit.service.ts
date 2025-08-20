import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { toJsonInput } from '../common/prisma-json';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  private getIp(req?: Request): string | undefined {
    if (!req) return undefined;
    const xf = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    return xf || (req.headers['x-real-ip'] as string | undefined) || req.ip;
  }

  async log(params: {
    corretorId: string;
    entity: string;
    entityId: string;
    action: AuditAction;
    before?: unknown;
    after?: unknown;
    actorId?: string;
    req?: Request;
  }): Promise<void> {
    const { corretorId, entity, entityId, action, before, after, actorId, req } = params;

    await this.prisma.auditLog.create({
      data: {
        corretorId,
        entity,
        entityId,
        action,
        before: toJsonInput(before),
        after: toJsonInput(after),
        actorId: actorId ?? null,
        ip: this.getIp(req) ?? null,
        userAgent: (req?.headers['user-agent'] as string | undefined) ?? null,
      },
    });
  }
}
