// src/policies/policies.service.ts
import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { Prisma, PolicyStatus } from "@prisma/client";
import { CreatePolicyDto } from "./dto/create-policy.dto";
import { UpdatePolicyDto } from "./dto/update-policy.dto";
import { ListPoliciesQueryDto } from "./dto/list-policies-query.dto";

@Injectable()
export class PoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertClientBelongsToTenant(corretorId: string, clientId: string) {
    const cli = await this.prisma.client.findFirst({ where: { id: clientId, corretorId } });
    if (!cli) throw new BadRequestException("Client does not belong to this tenant.");
  }

  async create(corretorId: string, dto: CreatePolicyDto) {
    await this.assertClientBelongsToTenant(corretorId, dto.clientId);

    return this.prisma.policy.create({
      data: {
        corretorId,
        clientId: dto.clientId,
        policyNumber: dto.policyNumber,
        insurer: dto.insurer,
        product: dto.product ?? null,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        premium: new Prisma.Decimal(dto.premium),
        status: dto.status ?? PolicyStatus.DRAFT,
        notes: dto.notes ?? null,
      },
    });
  }

  async findAll(corretorId: string, q: ListPoliciesQueryDto) {
    const page = Math.max(1, Number(q.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
    const skip = (page - 1) * limit;
    const search = q.search?.trim();

    const where: Prisma.PolicyWhereInput = {
      corretorId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(search
        ? {
            OR: [
              { policyNumber: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { insurer: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { product: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { client: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
              { client: { email: { contains: search, mode: Prisma.QueryMode.insensitive } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.policy.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          client: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.policy.count({ where }),
    ]);

    return { items, page, limit, total };
  }

  async findOne(corretorId: string, id: string) {
    const policy = await this.prisma.policy.findFirst({
      where: { id, corretorId },
      include: { client: { select: { id: true, name: true, email: true } } },
    });
    if (!policy) throw new NotFoundException("Policy not found");
    return policy;
  }

  async update(corretorId: string, id: string, dto: UpdatePolicyDto) {
    // garante que a apólice pertence ao tenant
    const existing = await this.prisma.policy.findFirst({ where: { id, corretorId } });
    if (!existing) throw new NotFoundException("Policy not found");

    if (dto.clientId && dto.clientId !== existing.clientId) {
      await this.assertClientBelongsToTenant(corretorId, dto.clientId);
    }

    return this.prisma.policy.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        policyNumber: dto.policyNumber,
        insurer: dto.insurer,
        product: dto.product ?? undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        premium: dto.premium !== undefined ? new Prisma.Decimal(dto.premium) : undefined,
        status: dto.status,
        notes: dto.notes ?? undefined,
      },
    });
  }

  async remove(corretorId: string, id: string) {
    const existing = await this.prisma.policy.findFirst({ where: { id, corretorId } });
    if (!existing) throw new NotFoundException("Policy not found");

    await this.prisma.policy.delete({ where: { id } });
    return { ok: true };
  }
}
