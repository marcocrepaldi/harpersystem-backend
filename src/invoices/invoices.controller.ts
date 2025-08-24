import {
  BadRequestException,
  Controller,
  Delete,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InvoicesService } from './invoices.service';

@Controller('clients/:clientId/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadInvoice(
    @Param('clientId') clientId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })], // apenas tamanho
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    return this.invoicesService.processInvoiceUpload(clientId, file);
  }

  @Delete()
  async deleteByMonth(
    @Param('clientId') clientId: string,
    @Query('mes') mes?: string,
  ) {
    if (!mes) {
      throw new BadRequestException('Parâmetro "mes" é obrigatório (YYYY-MM).');
    }
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
    }

    const [y, m] = mes.split('-').map(Number);
    const mesReferencia = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    return this.invoicesService.deleteInvoiceByMonth(clientId, mesReferencia);
  }
}
