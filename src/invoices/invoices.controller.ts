import {
  Controller,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  Query,
  BadRequestException,
  Get,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InvoicesService } from './invoices.service';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';

@Controller('clients/:clientId/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadInvoice(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
    @Query('mes') mes?: string, // YYYY-MM
  ) {
    let mesReferencia: Date | undefined;

    if (mes) {
      const ok = /^\d{4}-\d{2}$/.test(mes);
      if (!ok) throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
      const [y, m] = mes.split('-').map((s) => parseInt(s, 10));
      mesReferencia = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    }

    return this.invoicesService.processInvoiceUpload(clientId, file, mesReferencia);
  }

  /**
   * GET /api/clients/:clientId/invoices?mes=YYYY-MM
   * Retorna resumo + itens importados do mês (ou mês atual se não enviado).
   */
  @Get()
  async listImported(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Query('mes') mes?: string,
  ) {
    let mesReferencia: Date | undefined;
    if (mes) {
      const ok = /^\d{4}-\d{2}$/.test(mes);
      if (!ok) throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
      const [y, m] = mes.split('-').map((s) => parseInt(s, 10));
      mesReferencia = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    }
    return this.invoicesService.getImportedForMonth(clientId, mesReferencia);
  }
}
