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
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { BeneficiariesService } from './beneficiaries.service';
import { FindBeneficiariesQueryDto } from './dto/find-beneficiaries.dto';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { DeleteManyDto } from './dto/delete-many.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';

/**
 * Rotas de beneficiários por cliente
 * Base: /api/clients/:clientId/beneficiaries
 */
@Controller('clients/:clientId/beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiariesService: BeneficiariesService) {}

  /** Lista beneficiários (titulares + dependentes) com filtros/paginação. */
  @Get()
  findMany(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Query() query: FindBeneficiariesQueryDto,
  ) {
    return this.beneficiariesService.findMany(clientId, query);
  }

  /**
   * Importação em massa (CSV/XLS/XLSX).
   * Validação de tipo de arquivo é tolerante e feita no service.
   */
  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          // 50 MB
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.beneficiariesService.processUpload(clientId, file);
  }

  /** Cria um beneficiário (vida por vida). */
  @Post()
  @HttpCode(201)
  create(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Body() createDto: CreateBeneficiaryDto,
  ) {
    return this.beneficiariesService.create(clientId, createDto);
  }

  /** Exclusão em massa. */
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

  /** Atualiza um beneficiário. */
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
