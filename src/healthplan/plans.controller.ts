import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PlansService } from './plans.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CreatePlanAliasDto,
  CreatePlanPriceDto,
  UpdatePlanPriceDto,
} from './dto/plan.dto';

@Controller('health/plans')
export class PlansController {
  constructor(private readonly service: PlansService) {}

  /* -------- Plans -------- */
  @Post()
  createPlan(@Body() dto: CreatePlanDto) {
    return this.service.createPlan(dto);
  }

  @Get()
  listPlans() {
    return this.service.listPlans();
  }

  @Get(':planId')
  getPlan(@Param('planId') planId: string) {
    return this.service.getPlan(planId);
  }

  @Patch(':planId')
  updatePlan(@Param('planId') planId: string, @Body() dto: UpdatePlanDto) {
    return this.service.updatePlan(planId, dto);
  }

  @Delete(':planId')
  deletePlan(@Param('planId') planId: string) {
    return this.service.deletePlan(planId);
  }

  /* -------- Aliases -------- */
  @Post(':planId/aliases')
  addAlias(@Param('planId') planId: string, @Body() dto: CreatePlanAliasDto) {
    return this.service.addAlias(planId, dto);
  }

  @Get(':planId/aliases')
  listAliases(@Param('planId') planId: string) {
    return this.service.listAliases(planId);
  }

  @Delete('aliases/:aliasId')
  removeAlias(@Param('aliasId') aliasId: string) {
    return this.service.removeAlias(aliasId);
  }

  /* -------- Prices (global) -------- */
  @Post(':planId/prices')
  createPrice(@Param('planId') planId: string, @Body() dto: CreatePlanPriceDto) {
    return this.service.createPrice({ ...dto, planId });
  }

  @Get(':planId/prices')
  listPrices(@Param('planId') planId: string) {
    return this.service.listPrices(planId);
  }

  @Patch('prices/:priceId')
  updatePrice(@Param('priceId') priceId: string, @Body() dto: UpdatePlanPriceDto) {
    return this.service.updatePrice(priceId, dto);
  }

  @Delete('prices/:priceId')
  deletePrice(@Param('priceId') priceId: string) {
    return this.service.deletePrice(priceId);
  }
}
