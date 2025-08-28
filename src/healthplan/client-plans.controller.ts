import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ClientPlansService } from './client-plans.service';
import { UpsertClientPlanDto, CreateClientPlanPriceDto } from './dto/client-plan.dto';

@Controller('clients/:clientId/plans')
export class ClientPlansController {
  constructor(private readonly service: ClientPlansService) {}

  /* vínculo cliente ↔ plano */
  @Post()
  upsert(@Param('clientId') clientId: string, @Body() dto: UpsertClientPlanDto) {
    return this.service.upsertClientPlan(clientId, dto);
  }

  @Get()
  list(@Param('clientId') clientId: string) {
    return this.service.listClientPlans(clientId);
  }

  @Delete(':planId')
  remove(@Param('clientId') clientId: string, @Param('planId') planId: string) {
    return this.service.removeClientPlan(clientId, planId);
  }

  /* preços por cliente */
  @Post(':planId/prices')
  createPrice(
    @Param('clientId') clientId: string,
    @Param('planId') planId: string,
    @Body() dto: CreateClientPlanPriceDto,
  ) {
    return this.service.createClientPlanPrice(clientId, { ...dto, planId });
  }

  @Get(':planId/prices')
  listPrices(@Param('clientId') clientId: string, @Param('planId') planId: string) {
    return this.service.listClientPlanPrices(clientId, planId);
  }

  @Delete('prices/:priceId')
  deletePrice(@Param('priceId') priceId: string) {
    return this.service.deleteClientPlanPrice(priceId);
  }
}
