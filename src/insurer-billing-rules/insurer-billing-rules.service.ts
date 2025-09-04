import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Prisma, RegimeCobranca } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export type RequestUser = {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  corretorId: string;
};

// ---- DTOs locais (ajuste se já tiver DTOs formais) ----
type CreateRuleDto = {
  insurerId: string;
  clientId?: string | null;
  planId?: string | null;
  faixaEtaria?: string | null;
  regime?: RegimeCobranca | null;
  validFrom: string | Date;
  validTo?: string | Date | null;
  isActive?: boolean;
  policy?: unknown; // JSON
};

type UpdateRuleDto = {
  insurerId?: string;
  clientId?: string | null; // null/'' => desconectar
  planId?: string | null;   // null/'' => desconectar
  faixaEtaria?: string | null;
  regime?: RegimeCobranca | null;
  validFrom?: string | Date;
  validTo?: string | Date | null;
  isActive?: boolean;
  policy?: unknown; // JSON
  expectedUpdatedAt?: string;
};

type ListQuery = {
  insurerId?: string;
  clientId?: string;
  planId?: string;
  faixaEtaria?: string;
  regime?: RegimeCobranca;
  isActive?: string; // "true" | "false"
  q?: string;
  from?: string; // YYYY-MM
  to?: string;   // YYYY-MM
  page?: number;
  limit?: number;
  sortBy?: 'validFrom' | 'updatedAt' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
};

function emptyToUndef<T>(v: T): T | undefined {
  if (v === null) return undefined as any;
  return typeof v === 'string' && v.trim() === '' ? undefined : (v as any);
}
function parseYYYYMM(s?: string): Date | undefined {
  if (!s) return undefined;
  if (!/^\d{4}-\d{2}$/.test(s)) return undefined;
  const [y, m] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
}

/** Retorna tipo aceito pelo Prisma: InputJsonValue | JsonNull (sem DbNull) */
function jsonCreateValue(
  v: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (v === undefined || v === null) return Prisma.JsonNull;
  return v as Prisma.InputJsonValue;
}
function jsonUpdateValue(
  v: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (v === undefined) return undefined; // não altera
  if (v === null) return Prisma.JsonNull; // zera para JSON null
  return v as Prisma.InputJsonValue;
}

@Injectable()
export class InsurerBillingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private ensureAdmin(user: RequestUser) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can modify insurer billing rules');
    }
  }

  private buildInclude() {
    return {
      insurer: { select: { id: true, tradeName: true, slug: true } },
      client: { select: { id: true, name: true } },
      plan: { select: { id: true, name: true } },
    } satisfies Prisma.InsurerBillingRuleInclude;
  }

  async getById(id: string) {
    const rule = await this.prisma.insurerBillingRule.findUnique({
      where: { id },
      include: this.buildInclude(),
    });
    if (!rule) throw new NotFoundException('Billing rule not found');
    return rule;
  }

  async list(query: ListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    // janela de vigência (interseção com [from, to])
    const fromDate = parseYYYYMM(query.from);
    const toDate = parseYYYYMM(query.to);
    const periodFilter: Prisma.InsurerBillingRuleWhereInput | undefined =
      fromDate || toDate
        ? {
            AND: [
              ...(toDate
                ? [
                    {
                      validFrom: {
                        lte: new Date(
                          Date.UTC(
                            toDate.getUTCFullYear(),
                            toDate.getUTCMonth() + 1,
                            1,
                          ),
                        ),
                      },
                    },
                  ]
                : []),
              {
                OR: [
                  { validTo: null },
                  ...(fromDate ? [{ validTo: { gte: fromDate } }] : []),
                ],
              },
            ],
          }
        : undefined;

    const where: Prisma.InsurerBillingRuleWhereInput = {
      ...(query.insurerId ? { insurerId: query.insurerId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.faixaEtaria ? { faixaEtaria: query.faixaEtaria } : {}),
      ...(query.regime ? { regime: query.regime } : {}),
      ...(typeof query.isActive === 'string'
        ? { isActive: query.isActive === 'true' }
        : {}),
      ...(query.q
        ? {
            OR: [
              { faixaEtaria: { contains: query.q, mode: 'insensitive' } },
              // busca textual simples no JSON (fallback)
              { policy: { path: [], string_contains: query.q as any } as any },
            ],
          }
        : {}),
      ...(periodFilter ? periodFilter : {}),
    };

    const orderBy: Prisma.InsurerBillingRuleOrderByWithRelationInput =
      query.sortBy === 'createdAt'
        ? { createdAt: query.sortOrder ?? 'desc' }
        : query.sortBy === 'updatedAt'
        ? { updatedAt: query.sortOrder ?? 'desc' }
        : { validFrom: query.sortOrder ?? 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.insurerBillingRule.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: this.buildInclude(),
      }),
      this.prisma.insurerBillingRule.count({ where }),
    ]);

    return { items, page, limit, total };
  }

  async create(user: RequestUser, dto: CreateRuleDto, req?: Request) {
    this.ensureAdmin(user);

    if (!dto.insurerId) throw new BadRequestException('insurerId is required');
    if (!dto.validFrom) throw new BadRequestException('validFrom is required');

    const data: Prisma.InsurerBillingRuleCreateInput = {
      insurer: { connect: { id: dto.insurerId } },
      ...(emptyToUndef(dto.clientId)
        ? { client: { connect: { id: dto.clientId! } } }
        : {}),
      ...(emptyToUndef(dto.planId)
        ? { plan: { connect: { id: dto.planId! } } }
        : {}),
      faixaEtaria: emptyToUndef(dto.faixaEtaria),
      regime: emptyToUndef(dto.regime),
      validFrom: new Date(dto.validFrom),
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      isActive: dto.isActive ?? true,
      policy: jsonCreateValue(dto.policy),
    };

    const created = await this.prisma.insurerBillingRule.create({
      data,
      include: this.buildInclude(),
    });

    await this.audit.log({
      corretorId: user.corretorId,
      entity: 'insurer_billing_rule',
      entityId: created.id,
      action: 'CREATE',
      before: null,
      after: created,
      actorId: user.id,
      req,
    });

    return created;
  }

  async update(id: string, user: RequestUser, dto: UpdateRuleDto, req?: Request) {
    this.ensureAdmin(user);

    const existing = await this.prisma.insurerBillingRule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Billing rule not found');

    if (dto.expectedUpdatedAt) {
      const expected = new Date(dto.expectedUpdatedAt).getTime();
      const current = new Date(existing.updatedAt).getTime();
      if (expected !== current) {
        throw new BadRequestException(
          'Record has changed since your last read (concurrency check failed)',
        );
      }
    }

    const rels: Prisma.InsurerBillingRuleUpdateInput = {
      ...(dto.insurerId !== undefined && {
        insurer: { connect: { id: dto.insurerId } },
      }),
      ...(dto.clientId !== undefined &&
        (emptyToUndef(dto.clientId)
          ? { client: { connect: { id: dto.clientId! } } }
          : { client: { disconnect: true } })),
      ...(dto.planId !== undefined &&
        (emptyToUndef(dto.planId)
          ? { plan: { connect: { id: dto.planId! } } }
          : { plan: { disconnect: true } })),
    };

    const base: Prisma.InsurerBillingRuleUpdateInput = {
      ...rels,
      faixaEtaria:
        dto.faixaEtaria !== undefined ? emptyToUndef(dto.faixaEtaria) : undefined,
      regime: dto.regime !== undefined ? emptyToUndef(dto.regime) : undefined,
      validFrom:
        dto.validFrom !== undefined ? new Date(dto.validFrom) : undefined,
      validTo:
        dto.validTo !== undefined ? (dto.validTo ? new Date(dto.validTo) : null) : undefined,
      isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      policy: jsonUpdateValue(dto.policy),
    };

    const updated = await this.prisma.insurerBillingRule.update({
      where: { id },
      data: base,
      include: this.buildInclude(),
    });

    await this.audit.log({
      corretorId: user.corretorId,
      entity: 'insurer_billing_rule',
      entityId: id,
      action: 'UPDATE',
      before: existing,
      after: updated,
      actorId: user.id,
      req,
    });

    return updated;
  }

  async toggleActive(id: string, user: RequestUser, req?: Request) {
    this.ensureAdmin(user);

    const existing = await this.prisma.insurerBillingRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Billing rule not found');

    const updated = await this.prisma.insurerBillingRule.update({
      where: { id },
      data: { isActive: !existing.isActive },
      include: this.buildInclude(),
    });

    await this.audit.log({
      corretorId: user.corretorId,
      entity: 'insurer_billing_rule',
      entityId: id,
      action: 'UPDATE',
      before: existing,
      after: updated,
      actorId: user.id,
      req,
    });

    return updated;
  }

  async remove(id: string, user: RequestUser, req?: Request) {
    this.ensureAdmin(user);

    const existing = await this.prisma.insurerBillingRule.findUnique({
      where: { id },
      include: this.buildInclude(),
    });
    if (!existing) throw new NotFoundException('Billing rule not found');

    await this.prisma.insurerBillingRule.delete({ where: { id } });

    await this.audit.log({
      corretorId: user.corretorId,
      entity: 'insurer_billing_rule',
      entityId: id,
      action: 'DELETE',
      before: existing,
      after: null,
      actorId: user.id,
      req,
    });

    return { ok: true };
  }
}
