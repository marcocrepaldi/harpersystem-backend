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
  ParseFilePipe,
  MaxFileSizeValidator,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BeneficiariesService } from './beneficiaries.service';
import { FindBeneficiariesQueryDto } from './dto/find-beneficiaries.dto';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
// Futuramente: import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

// Rota correta, que será prefixada pelo '/api' global do main.ts
@Controller('clients/:clientId/beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiariesService: BeneficiariesService) {}

  /**
   * Lista todos os beneficiários de um cliente com paginação e busca.
   * GET /api/clients/:clientId/beneficiaries
   */
  @Get()
  findMany(
    @Param('clientId') clientId: string,
    @Query() query: FindBeneficiariesQueryDto,
  ) {
    return this.beneficiariesService.findMany(clientId, query);
  }

  /**
   * Recebe um arquivo (CSV/XLSX) para importação em massa.
   * POST /api/clients/:clientId/beneficiaries/upload
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('clientId') clientId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })], // Limite: 50MB
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.beneficiariesService.processUpload(clientId, file);
  }

  /**
   * Cria um novo beneficiário ("vida por vida").
   * POST /api/clients/:clientId/beneficiaries
   */
  @Post()
  create(
    @Param('clientId') clientId: string,
    @Body() createDto: CreateBeneficiaryDto,
  ) {
    // A validação do DTO é feita automaticamente pelo ValidationPipe global
    return this.beneficiariesService.create(clientId, createDto);
  }

  /**
   * Busca um beneficiário específico pelo seu ID.
   * GET /api/clients/:clientId/beneficiaries/:beneficiaryId
   */
  @Get(':beneficiaryId')
  findOne(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    // return this.beneficiariesService.findOne(clientId, beneficiaryId);
    throw new NotFoundException('Endpoint de busca individual ainda não implementado.');
  }

  /**
   * Atualiza um beneficiário específico.
   * PATCH /api/clients/:clientId/beneficiaries/:beneficiaryId
   */
  @Patch(':beneficiaryId')
  update(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body() updateDto: any, // Substituir por UpdateBeneficiaryDto
  ) {
    // return this.beneficiariesService.update(clientId, beneficiaryId, updateDto);
    throw new NotFoundException('Endpoint de atualização ainda não implementado.');
  }

  /**
   * Exclui um beneficiário específico.
   * DELETE /api/clients/:clientId/beneficiaries/:beneficiaryId
   */
  @Delete(':beneficiaryId')
  remove(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    // return this.beneficiariesService.remove(clientId, beneficiaryId);
    throw new NotFoundException('Endpoint de exclusão individual ainda não implementado.');
  }
}