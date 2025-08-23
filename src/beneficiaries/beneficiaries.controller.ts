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
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BeneficiariesService } from './beneficiaries.service';
import { FindBeneficiariesQueryDto } from './dto/find-beneficiaries.dto';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { DeleteManyDto } from './dto/delete-many.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

/**
 * Controller para gerenciar os beneficiários de um cliente específico.
 * Rota base: /api/clients/:clientId/beneficiaries
 */
@Controller('clients/:clientId/beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiariesService: BeneficiariesService) {}

  /**
   * Lista todos os beneficiários de um cliente com filtros e paginação.
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
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('clientId') clientId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }), // 50MB
          new FileTypeValidator({
            fileType: /(^text\/csv$)|(^application\/vnd\.ms-excel$)|(^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$)/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.beneficiariesService.processUpload(clientId, file);
  }

  /**
   * Cria um novo beneficiário ("vida por vida").
   */
  @Post()
  create(
    @Param('clientId') clientId: string,
    @Body() createDto: CreateBeneficiaryDto,
  ) {
    return this.beneficiariesService.create(clientId, createDto);
  }

  /**
   * Rota para exclusão em massa de beneficiários.
   */
  @Post('bulk-delete')
  removeMany(
    @Param('clientId') clientId: string,
    @Body() deleteManyDto: DeleteManyDto,
  ) {
    return this.beneficiariesService.removeMany(clientId, deleteManyDto);
  }

  /**
   * Busca um beneficiário específico pelo seu ID.
   */
  @Get(':beneficiaryId')
  findOne(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.beneficiariesService.findOne(clientId, beneficiaryId);
  }

  /**
   * Atualiza um beneficiário específico.
   */
  @Patch(':beneficiaryId')
  update(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body() updateDto: UpdateBeneficiaryDto,
  ) {
    return this.beneficiariesService.update(clientId, beneficiaryId, updateDto);
  }

  /**
   * Exclui um beneficiário específico.
   */
  @Delete(':beneficiaryId')
  remove(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.beneficiariesService.remove(clientId, beneficiaryId);
  }
}