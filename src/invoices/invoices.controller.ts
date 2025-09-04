import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  MaxFileSizeValidator, // ✅ volta a usar o validador oficial do Nest
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
        validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
    @Query('insurerId') insurerId?: string, // opcional: multi-operadora
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }

    // Aceitos por MIME
    const allowedMimeTypes = new Set([
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);

    // Aceitos por extensão (fallback – alguns navegadores/fornecedores enviam MIME incorreto)
    const allowedExtensions = ['.csv', '.xls', '.xlsx'];

    const mimeOk = allowedMimeTypes.has((file.mimetype || '').toLowerCase());
    const name = (file.originalname || '').toLowerCase();
    const extOk = allowedExtensions.some((ext) => name.endsWith(ext));

    if (!mimeOk && !extOk) {
      throw new BadRequestException(
        `Tipo de arquivo não suportado (${file.mimetype || 'desconhecido'}). Envie um CSV, XLS ou XLSX.`,
      );
    }

    const insurer = (insurerId || '').trim() || undefined;

    return this.invoicesService.processInvoiceUpload(clientId, file, insurer);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async listByMonth(
    @Param('clientId') clientId: string,
    @Query() query: listImportedInvoicesDTO,
    @Query('insurerId') insurerId?: string, // opcional: filtrar por operadora
  ) {
    return this.invoicesService.listImported(clientId, query, insurerId?.trim() || undefined);
  }

  @Delete()
  @Header('Cache-Control', 'no-store')
  async deleteByMonth(
    @Param('clientId') clientId: string,
    @Query('mes') mes?: string,
    @Query('insurerId') insurerId?: string, // opcional: apagar apenas daquela operadora
  ) {
    if (!mes) {
      throw new BadRequestException('Parâmetro "mes" é obrigatório (YYYY-MM).');
    }
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
    }

    const [y, m] = mes.split('-').map(Number);
    const mesReferencia = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));

    return this.invoicesService.deleteInvoiceByMonth(
      clientId,
      mesReferencia,
      insurerId?.trim() || undefined,
    );
  }

  @Patch('reconcile')
  @Header('Cache-Control', 'no-store')
  async reconcileInvoices(
    @Param('clientId') clientId: string,
    @Body() body: reconcileInvoicesDTO,
  ) {
    // Agora suporta:
    // - invoiceIds (legado)
    // - openMonth
    // - closeMonth + closure{ valorTotalInformado, observacoes, gerarComissoesAgora }
    // - updateClosure + closure{ ... }
    return this.invoicesService.reconcile(clientId, body);
  }
}
