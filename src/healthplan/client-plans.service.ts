import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, RegimeCobranca } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertClientPlanDto, CreateClientPlanPriceDto } from './dto/client-plan.dto';

@Injectable()
export class ClientPlansService {
  constructor(private readonly prisma: PrismaService) {}

  /* -------- Vínculo Cliente ↔ Plano -------- */
  async upsertClientPlan(clientId: string, dto: UpsertClientPlanDto) {
    const plan = await this.prisma.healthPlan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new BadRequestException('Plano não encontrado.');

    return this.prisma.clientHealthPlan.upsert({
      where: { clientId_planId: { clientId, planId: dto.planId } },
      update: { isActive: dto.isActive ?? true },
      create: {
        client: { connect: { id: clientId } },
        plan: { connect: { id: dto.planId } },
        isActive: dto.isActive ?? true,
      },
    });
  }

  async listClientPlans(clientId: string) {
    return this.prisma.clientHealthPlan.findMany({
      where: { clientId },
      include: { plan: true },
      orderBy: [{ isActive: 'desc' }, { planId: 'asc' }],
    });
  }

  async removeClientPlan(clientId: string, planId: string) {
    await this.prisma.clientHealthPlan.delete({
      where: { clientId_planId: { clientId, planId } },
    });
    return { message: 'Plano desvinculado do cliente.' };
  }

  /* -------- Preços por Cliente -------- */
  async createClientPlanPrice(clientId: string, dto: CreateClientPlanPriceDto) {
    const link = await this.prisma.clientHealthPlan.findUnique({
      where: { clientId_planId: { clientId, planId: dto.planId } },
    });
    if (!link) {
      throw new BadRequestException('Vincule o plano ao cliente antes de cadastrar preços.');
    }

    return this.prisma.clientHealthPlanPrice.create({
      data: {
        clientId,
        planId: dto.planId,
        vigenciaInicio: new Date(dto.vigenciaInicio),
        vigenciaFim: dto.vigenciaFim ? new Date(dto.vigenciaFim) : undefined,
        faixaEtaria: dto.faixaEtaria ?? undefined,
        valor: new Prisma.Decimal(String(dto.valor).replace(',', '.')),
        regimeCobranca: (dto.regimeCobranca ?? null) as RegimeCobranca | null,
      },
    });
  }

  async listClientPlanPrices(clientId: string, planId: string) {
    return this.prisma.clientHealthPlanPrice.findMany({
      where: { clientId, planId },
      orderBy: [{ vigenciaInicio: 'desc' }, { faixaEtaria: 'asc' }],
    });
  }

  async deleteClientPlanPrice(priceId: string) {
    await this.prisma.clientHealthPlanPrice.delete({ where: { id: priceId } });
    return { message: 'Preço removido.' };
  }
}
