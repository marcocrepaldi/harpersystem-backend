// src/beneficiaries/beneficiaries.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { BeneficiariesService } from './beneficiaries.service';
import { FindBeneficiariesQueryDto } from './dto/find-beneficiaries.dto';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { DeleteManyDto } from './dto/delete-many.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';

@Controller('clients/:clientId/beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiariesService: BeneficiariesService) {}

  /** Lista beneficiários com filtros e agora exibe todos por padrão. */
  @Get()
  findMany(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Query() query: FindBeneficiariesQueryDto,
  ) {
    const queryWithAll = { ...query, all: true };
    return this.beneficiariesService.findMany(clientId, queryWithAll);
  }

  /**
   * Importação em massa (CSV/XLS/XLSX).
   * Sem validação de tamanho/tipo no controller.
   */
  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.beneficiariesService.processUpload(clientId, file);
  }

  /** Cria um beneficiário (vida a vida). */
  @Post()
  @HttpCode(201)
  create(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Body() createDto: CreateBeneficiaryDto,
  ) {
    return this.beneficiariesService.create(clientId, createDto);
  }

  /** Exclusão em massa por IDs. */
  @Post('bulk-delete')
  @HttpCode(200)
  removeMany(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Body() deleteManyDto: DeleteManyDto,
  ) {
    return this.beneficiariesService.removeMany(clientId, deleteManyDto);
  }

  /** Detalhe de um beneficiário. */
  @Get(':beneficiaryId')
  findOne(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Param('beneficiaryId', ParseCuidPipe) beneficiaryId: string,
  ) {
    return this.beneficiariesService.findOne(clientId, beneficiaryId);
  }

  /** Atualiza parcialmente um beneficiário. */
  @Patch(':beneficiaryId')
  @HttpCode(200)
  update(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Param('beneficiaryId', ParseCuidPipe) beneficiaryId: string,
    @Body() updateDto: UpdateBeneficiaryDto,
  ) {
    return this.beneficiariesService.update(clientId, beneficiaryId, updateDto);
  }

  /** Exclui um beneficiário. */
  @Delete(':beneficiaryId')
  @HttpCode(200)
  remove(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Param('beneficiaryId', ParseCuidPipe) beneficiaryId: string,
  ) {
    return this.beneficiariesService.remove(clientId, beneficiaryId);
  }
}
