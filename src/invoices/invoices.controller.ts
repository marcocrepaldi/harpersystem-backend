import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  FileTypeValidator,
  Body,
  Patch,
  ParseArrayPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InvoicesService } from './invoices.service';
import { listImportedInvoicesDTO, reconcileInvoicesDTO } from './dto/invoices.dto';

@Controller('clients/:clientId/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadInvoice(
    @Param('clientId') clientId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');

    const allowedMimeTypes = [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    const isMimeTypeAllowed = allowedMimeTypes.includes(file.mimetype.toLowerCase());

    if (!isMimeTypeAllowed) {
      throw new BadRequestException(
        `Tipo de arquivo não suportado: ${file.mimetype}. Tipos permitidos: .csv, .xls, .xlsx`,
      );
    }
    
    return this.invoicesService.processInvoiceUpload(clientId, file);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async listByMonth(
    @Param('clientId') clientId: string,
    @Query() query: listImportedInvoicesDTO,
  ) {
    return this.invoicesService.listImported(clientId, query);
  }

  @Delete()
  @Header('Cache-Control', 'no-store')
  async deleteByMonth(
    @Param('clientId') clientId: string,
    @Query('mes') mes?: string,
  ) {
    if (!mes) throw new BadRequestException('Parâmetro "mes" é obrigatório (YYYY-MM).');
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
    }
    const [y, m] = mes.split('-').map(Number);
    const mesReferencia = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    return this.invoicesService.deleteInvoiceByMonth(clientId, mesReferencia);
  }

  @Patch('reconcile')
  async reconcileInvoices(
    @Param('clientId') clientId: string,
    @Body() body: reconcileInvoicesDTO,
  ) {
    return this.invoicesService.reconcileByIds(clientId, body.invoiceIds);
  }
}