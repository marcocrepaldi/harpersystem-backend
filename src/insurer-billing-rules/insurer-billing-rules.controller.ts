import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InsurerBillingRulesService } from './insurer-billing-rules.service';
import type { RequestUser } from './insurer-billing-rules.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('insurer-billing-rules')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class InsurerBillingRulesController {
  constructor(private readonly service: InsurerBillingRulesService) {}

  @Get()
  list(@Query() query: any) {
    return this.service.list(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  create(
    @Body() dto: any,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.create(user, dto, req);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, user, dto, req);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.remove(id, user, req);
  }

  @Patch(':id/toggle-active')
  toggleActive(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.toggleActive(id, user, req);
  }
}
