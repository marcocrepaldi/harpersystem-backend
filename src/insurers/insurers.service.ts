import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Prisma, InsuranceLine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInsurerDto } from './dto/create-insurer.dto';
import { UpdateInsurerDto } from './dto/update-insurer.dto';
import { toJsonInput } from '../common/prisma-json';

export type RequestUser = {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  corretorId: string;
};

type IncludeKey = 'healthPlans' | 'policies';

function emptyToUndef<T>(v: T): T | undefined {
  return typeof v === 'string' && v === '' ? undefined : v;
}
function omitUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}
function normalizeSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

@Injectable()
export class InsurersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private ensureAdmin(user: RequestUser) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Only ADMIN can modify insurers');
    }
  }

  private buildInclude(includeRels: boolean | IncludeKey[] | undefined): Prisma.InsurerInclude | undefined {
    if (includeRels === true) {
      return {
        healthPlans: { orderBy: { name: 'asc' } },
        policies: { orderBy: { createdAt: 'desc' } },
        _count: { select: { healthPlans: true, policies: true } },
      };
    }
    if (Array.isArray(includeRels)) {
      return {
        healthPlans: includeRels.includes('healthPlans') ? { orderBy: { name: 'asc' } } : false,
        policies: includeRels.includes('policies') ? { orderBy: { createdAt: 'desc' } } : false,
        _count: { select: { healthPlans: true, policies: true } },
      } as Prisma.InsurerInclude;
    }
    return undefined;
  }

  async list(
    user: RequestUser,
    query: {
      q?: string;
      line?: string;
      isActive?: string;
      page?: number;
      limit?: number;
      sortBy?: 'tradeName' | 'createdAt';
      sortOrder?: 'asc' | 'desc';
    },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: Prisma.InsurerWhereInput = {
      ...(query.q
        ? {
            OR: [
              { slug: { contains: query.q, mode: 'insensitive' } },
              { tradeName: { contains: query.q, mode: 'insensitive' } },
              { legalName: { contains: query.q, mode: 'insensitive' } },
              { taxId: { contains: query.q } },
              { ansCode: { contains: query.q } },
            ],
          }
        : {}),
      ...(typeof query.isActive === 'string' ? { isActive: query.isActive === 'true' } : {}),
      ...(query.line ? { lines: { has: query.line as InsuranceLine } } : {}),
    };

    const orderBy: Prisma.InsurerOrderByWithRelationInput =
      query.sortBy === 'createdAt'
        ? { createdAt: query.sortOrder ?? 'asc' }
        : { tradeName: query.sortOrder ?? 'asc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.insurer.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          slug: true,
          legalName: true,
          tradeName: true,
          taxId: true,
          ansCode: true,
          lines: true,
          isActive: true,
          website: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { healthPlans: true, policies: true } },
        },
      }),
      this.prisma.insurer.count({ where }),
    ]);

    return { items, page, limit, total };
  }

  async getById(id: string, includeRels: boolean | IncludeKey[] | undefined = true) {
    const include = this.buildInclude(includeRels);
    const insurer = await this.prisma.insurer.findUnique({ where: { id }, include });
    if (!insurer) throw new NotFoundException('Insurer not found');
    return insurer;
  }

  async create(user: RequestUser, dto: CreateInsurerDto, req?: Request) {
    this.ensureAdmin(user);
    const data: Prisma.InsurerCreateInput = {
      slug: normalizeSlug(dto.slug),
      legalName: dto.legalName,
      tradeName: dto.tradeName,
      taxId: emptyToUndef(dto.taxId),
      ansCode: emptyToUndef(dto.ansCode),
      lines: dto.lines && dto.lines.length ? dto.lines : [InsuranceLine.HEALTH],
      isActive: dto.isActive ?? true,
      website: emptyToUndef(dto.website),
      meta: undefined,
    };
    const created = await this.prisma.insurer.create({ data });

    await this.audit.log({
      corretorId: user.corretorId,
      entity: 'insurer',
      entityId: created.id,
      action: 'CREATE',
      before: null,
      after: created,
      actorId: user.id,
      req,
    });

    return created;
  }

  async update(id: string, user: RequestUser, dto: UpdateInsurerDto, req?: Request) {
    this.ensureAdmin(user);

    const existing = await this.prisma.insurer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Insurer not found');

    if (dto.expectedUpdatedAt) {
      const expected = new Date(dto.expectedUpdatedAt).getTime();
      const current = new Date(existing.updatedAt).getTime();
      if (expected !== current) {
        throw new BadRequestException(
          'Record has changed since your last read (concurrency check failed)',
        );
      }
    }

    const base: Prisma.InsurerUpdateInput = omitUndefined({
      slug: dto.slug ? normalizeSlug(dto.slug) : undefined,
      legalName: emptyToUndef(dto.legalName),
      tradeName: emptyToUndef(dto.tradeName),
      taxId: emptyToUndef(dto.taxId),
      ansCode: emptyToUndef(dto.ansCode),
      isActive: dto.isActive,
      website: emptyToUndef(dto.website),
      lines: dto.lines ? dto.lines : undefined,
      meta: toJsonInput((dto as any).meta),
    });

    const updated = await this.prisma.insurer.update({ where: { id }, data: base });

    await this.audit.log({
      corretorId: user.corretorId,
      entity: 'insurer',
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

    const exists = await this.prisma.insurer.findUnique({
      where: { id },
      select: { id: true, _count: { select: { healthPlans: true, policies: true } } },
    });
    if (!exists) throw new NotFoundException('Insurer not found');

    const { healthPlans, policies } = exists._count;
    if (healthPlans > 0 || policies > 0) {
      throw new BadRequestException(
        'Cannot delete insurer with related policies/health plans. Disable it instead.',
      );
    }

    await this.prisma.insurer.delete({ where: { id } });

    await this.audit.log({
      corretorId: user.corretorId,
      entity: 'insurer',
      entityId: id,
      action: 'DELETE',
      before: exists,
      after: null,
      actorId: user.id,
      req,
    });

    return { ok: true };
  }

  async toggleActive(id: string, user: RequestUser, req?: Request) {
    this.ensureAdmin(user);

    const existing = await this.prisma.insurer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Insurer not found');

    const updated = await this.prisma.insurer.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });

    await this.audit.log({
      corretorId: user.corretorId,
      entity: 'insurer',
      entityId: id,
      action: 'UPDATE',
      before: existing,
      after: updated,
      actorId: user.id,
      req,
    });

    return updated;
  }

  async listLines() {
    return Object.values(InsuranceLine);
  }
}
