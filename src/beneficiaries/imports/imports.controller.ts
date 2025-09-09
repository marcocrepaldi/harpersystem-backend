import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BeneficiaryImportsService } from './imports.service';
import { StartImportDto } from './dto/start-import.dto';

@Controller('/api/clients/:clientId/beneficiaries/imports')
export class BeneficiaryImportsController {
  constructor(private readonly service: BeneficiaryImportsService) {}

  // POST /imports  => cria um novo run e o marca como latest
  @Post()
  async start(
    @Param('clientId') clientId: string,
    @Body() dto: StartImportDto,
  ) {
    return this.service.createLatest(clientId, dto.payload, dto.runId);
  }

  // GET /imports     => lista paginado
  @Get()
  async list(
    @Param('clientId') clientId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.service.list(clientId, Number(page), Number(pageSize));
  }

  // GET /imports/latest
  @Get('latest')
  async latest(@Param('clientId') clientId: string) {
    return this.service.getLatest(clientId);
  }

  // PATCH /imports/run/:runId/latest  => promove um existente a latest
  @Patch('run/:runId/latest')
  async makeLatest(@Param('clientId') clientId: string, @Param('runId') runId: string) {
    return this.service.setAsLatest(clientId, runId);
  }

  // GET /imports/run/:runId
  @Get('run/:runId')
  async getRun(@Param('clientId') clientId: string, @Param('runId') runId: string) {
    return this.service.getByIdOrRunId(clientId, runId);
  }

  // DELETE /imports/run/:runId
  @Delete('run/:runId')
  async deleteRun(@Param('clientId') clientId: string, @Param('runId') runId: string) {
    return this.service.deleteOne(clientId, runId);
  }

  // DELETE /imports
  @Delete()
  async deleteAll(@Param('clientId') clientId: string) {
    return this.service.deleteAll(clientId);
  }
}
