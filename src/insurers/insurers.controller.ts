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
import { InsurersService } from './insurers.service';
import type { RequestUser } from './insurers.service'; // <- troque para type-only import
import { FindInsurersQueryDto } from './dto/find-insurers.dto';
import { CreateInsurerDto } from './dto/create-insurer.dto';
import { UpdateInsurerDto } from './dto/update-insurer.dto';

function parseIncludeRels(
  value?: string,
): boolean | Array<'healthPlans' | 'policies'> | false | undefined {
  if (value === undefined) return undefined;
  const v = (value || '').trim().toLowerCase();
  if (v === 'true' || v === 'all' || v === '*') return true;
  if (v === 'false' || v === '') return false;
  const parts = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as Array<'healthPlans' | 'policies'>;
  return parts.length ? parts : false;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('insurers')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class InsurersController {
  constructor(private readonly service: InsurersService) {}

  @Get('lines')
  getLines() {
    return this.service.listLines();
  }

  @Get()
  findMany(@Query() query: FindInsurersQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.list(user, query);
  }

  @Post()
  create(
    @Body() dto: CreateInsurerDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.create(user, dto, req);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Query('includeRels') includeRelsParam?: string) {
    const parsed = parseIncludeRels(includeRelsParam);
    const includeRels = parsed === undefined ? true : parsed; // default = TRUE
    return this.service.getById(id, includeRels);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateInsurerDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, user, dto, req);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
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
