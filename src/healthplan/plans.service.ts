import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RegimeCobranca } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CreatePlanAliasDto,
  CreatePlanPriceDto,
  UpdatePlanPriceDto,
} from './dto/plan.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  /* ---------------- Plans ---------------- */
  async createPlan(dto: CreatePlanDto) {
    const exists = await this.prisma.healthPlan.findUnique({ where: { slug: dto.slug } });
    if (exists) throw new BadRequestException('Slug já cadastrado.');
    return this.prisma.healthPlan.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async listPlans() {
    return this.prisma.healthPlan.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async getPlan(planId: string) {
    const plan = await this.prisma.healthPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plano não encontrado.');
    return plan;
  }

  async updatePlan(planId: string, dto: UpdatePlanDto) {
    await this.getPlan(planId);
    return this.prisma.healthPlan.update({
      where: { id: planId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async deletePlan(planId: string) {
    await this.getPlan(planId);
    await this.prisma.healthPlan.delete({ where: { id: planId } });
    return { message: 'Plano excluído.' };
  }

  /* ---------------- Aliases ---------------- */
  async addAlias(planId: string, dto: CreatePlanAliasDto) {
    await this.getPlan(planId);
    const aliasNorm = dto.alias
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

    // a unique é composta (planId + alias) => não dá para usar findUnique só com alias
    const existsForPlan = await this.prisma.planAlias.findFirst({
      where: { planId, alias: aliasNorm },
      select: { id: true },
    });
    if (existsForPlan) {
      throw new BadRequestException('Alias já cadastrado para este plano.');
    }

    return this.prisma.planAlias.create({
      data: { planId, alias: aliasNorm },
    });
  }

  async listAliases(planId: string) {
    await this.getPlan(planId);
    return this.prisma.planAlias.findMany({
      where: { planId },
      orderBy: { alias: 'asc' },
    });
  }

  async removeAlias(aliasId: string) {
    await this.prisma.planAlias.delete({ where: { id: aliasId } });
    return { message: 'Alias removido.' };
  }

  /* ---------------- Prices (global) ---------------- */
  async createPrice(dto: CreatePlanPriceDto) {
    const plan = await this.getPlan(dto.planId);

    const data: Prisma.HealthPlanPriceCreateInput = {
      plan: { connect: { id: plan.id } },
      vigenciaInicio: new Date(dto.vigenciaInicio),
      vigenciaFim: dto.vigenciaFim ? new Date(dto.vigenciaFim) : undefined,
      faixaEtaria: dto.faixaEtaria ?? undefined,
      valor: new Prisma.Decimal(String(dto.valor).replace(',', '.')),
      regimeCobranca: (dto.regimeCobranca ?? null) as RegimeCobranca | null,
    };

    return this.prisma.healthPlanPrice.create({ data });
  }

  async listPrices(planId: string) {
    await this.getPlan(planId);
    return this.prisma.healthPlanPrice.findMany({
      where: { planId },
      orderBy: [{ vigenciaInicio: 'desc' }, { faixaEtaria: 'asc' }],
    });
  }

  async updatePrice(priceId: string, dto: UpdatePlanPriceDto) {
    const data: Prisma.HealthPlanPriceUpdateInput = {
      vigenciaInicio: dto.vigenciaInicio ? new Date(dto.vigenciaInicio) : undefined,
      vigenciaFim: dto.vigenciaFim ? new Date(dto.vigenciaFim) : undefined,
      faixaEtaria: dto.faixaEtaria,
      valor: dto.valor ? new Prisma.Decimal(String(dto.valor).replace(',', '.')) : undefined,
      regimeCobranca: (dto.regimeCobranca ?? undefined) as RegimeCobranca | undefined,
    };
    return this.prisma.healthPlanPrice.update({ where: { id: priceId }, data });
  }

  async deletePrice(priceId: string) {
    await this.prisma.healthPlanPrice.delete({ where: { id: priceId } });
    return { message: 'Preço removido.' };
  }
}
