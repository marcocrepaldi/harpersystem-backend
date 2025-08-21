import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BeneficiariesService } from './beneficiaries.service';
import { FindBeneficiariesQueryDto } from './dto/find-beneficiaries.dto';

// ✅ CORREÇÃO: Adicionado o prefixo 'api/' para bater com a chamada do frontend
@Controller('clients/:clientId/beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiariesService: BeneficiariesService) {}

  // Rota para listar os beneficiários (com paginação e busca)
  // GET /api/clients/:clientId/beneficiaries?search=...&page=1
  @Get()
  findMany(
    @Param('clientId') clientId: string,
    @Query() query: FindBeneficiariesQueryDto,
  ) {
    return this.beneficiariesService.findMany(clientId, query);
  }

  // Rota para o upload do arquivo de importação
  // POST /api/clients/:clientId/beneficiaries/upload
  @Post('upload')
  @UseInterceptors(FileInterceptor('file')) // 'file' é o nome do campo no formulário
  async uploadFile(
    @Param('clientId') clientId: string,
    @UploadedFile(
      // Validações básicas do arquivo (opcional, mas recomendado)
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })], // ex: 10MB
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.beneficiariesService.processUpload(clientId, file);
  }

  // Rota para criar um beneficiário manualmente ("vida por vida")
  // POST /api/clients/:clientId/beneficiaries
  @Post()
  create(@Param('clientId') clientId: string, @Body() createDto: any) {
    // A implementação deste método será nosso próximo passo
    console.log(`Criando novo beneficiário para o cliente ${clientId}:`, createDto);
    return { message: 'Endpoint de criação pronto.', clientId, data: createDto };
  }
}