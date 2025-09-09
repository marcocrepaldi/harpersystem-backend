/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  DefaultValuePipe,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  Delete,
  Patch,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BeneficiariesService } from './beneficiaries.service';

type PageResult<T> = { items: T[]; page: number; limit: number; total: number };

@Controller('clients/:clientId/beneficiaries')
export class BeneficiariesController {
  constructor(private readonly svc: BeneficiariesService) {}

  // ================== LISTAGEM ==================
  @Get()
  async list(
    @Param('clientId') clientId: string,
    @Query('search') search?: string,
    @Query('tipo') tipo?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(1000), ParseIntPipe) limit = 1000,
  ): Promise<PageResult<any>> {
    return this.svc.list(clientId, { search, tipo, status, page, limit });
  }

  // ================== BUSCA POR ID ==================
  @Get(':beneficiaryId')
  async findOne(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    const delegate = (this.svc as any).beneficiaryDelegate;
    if (!delegate) {
      throw new BadRequestException('Delegate Prisma para beneficiários não encontrado.');
    }
    return delegate.findFirstOrThrow({ where: { id: beneficiaryId, clientId } });
  }

  // ================== ATUALIZAÇÃO ==================
  @Patch(':beneficiaryId')
  async update(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body() dto: any,
  ) {
    const delegate = (this.svc as any).beneficiaryDelegate;
    if (!delegate) {
      throw new BadRequestException('Delegate Prisma para beneficiários não encontrado.');
    }
    return delegate.update({
      where: { id: beneficiaryId },
      data: { ...dto, clientId },
    });
  }

  // ================== EXCLUSÃO ==================
  @Delete(':beneficiaryId')
  async remove(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.svc.remove(clientId, beneficiaryId);
  }

  // ================== EXCLUSÃO EM LOTE ==================
  @Post('bulk-delete')
  async bulkDelete(
    @Param('clientId') clientId: string,
    @Body() body: { ids?: string[] },
  ) {
    const ids = body?.ids ?? [];
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Envie { ids: string[] } com pelo menos 1 id.');
    }
    return this.svc.removeMany(clientId, ids);
  }

  // ================== UPLOAD DE BENEFICIÁRIOS ==================
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('clientId') clientId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo (form field "file") é obrigatório.');
    return this.svc.upload(clientId, file);
  }

  // ================== CONSULTA DE IMPORTAÇÕES ==================
  @Get('imports/latest')
  async getLatestImport(@Param('clientId') clientId: string) {
    return this.svc.getLatestImportRun(clientId);
  }

  @Get('imports/run/:runId')
  async getImportById(
    @Param('clientId') clientId: string,
    @Param('runId') runId: string,
  ) {
    return this.svc.getImportRun(clientId, runId);
  }

  @Delete('imports/run/:runId')
  async deleteImportById(
    @Param('clientId') clientId: string,
    @Param('runId') runId: string,
  ) {
    return this.svc.deleteImportRun(clientId, runId);
  }

  @Delete('imports')
  async clearAllImports(@Param('clientId') clientId: string) {
    return this.svc.clearAllImportRuns(clientId);
  }
}
