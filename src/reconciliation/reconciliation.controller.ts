import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Header,
  HttpCode,
  StreamableFile,
} from '@nestjs/common';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { ReconciliationService } from './reconciliation.service';

type TipoParam = 'TITULAR' | 'DEPENDENTE' | 'ALL';

@Controller('clients/:clientId/reconciliation')
export class ReconciliationController {
  constructor(private readonly svc: ReconciliationService) {}

  @Get()
  async get(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Query('mes') mes?: string,
    @Query('tipo') tipo?: TipoParam,
    @Query('plano') plano?: string,
    @Query('centro') centro?: string,
  ) {
    if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
      throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
    }

    return this.svc.buildReconciliation(clientId, {
      mesReferencia: mes, // o service aceita Date | 'YYYY-MM' | 'MM/YYYY'
      filters: {
        tipo: !tipo || tipo === 'ALL' ? undefined : tipo,
        plano: plano?.trim() || undefined,
        centro: centro?.trim() || undefined,
      },
    });
  }

  @Get('options')
  async options(@Param('clientId', ParseCuidPipe) clientId: string) {
    return this.svc.getFilterOptions(clientId);
  }

  @Get('export')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async export(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Query('mes') mes?: string,
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
    @Query('tab')
    tab:
      | 'mismatched'
      | 'onlyInInvoice'
      | 'onlyInRegistry'
      | 'duplicates'
      | 'all'
      | 'allInvoice' = 'mismatched',
    @Query('tipo') tipo?: TipoParam,
    @Query('plano') plano?: string,
    @Query('centro') centro?: string,
  ): Promise<StreamableFile> {
    if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
      throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
    }
    if (format === 'csv' && tab === 'all') {
      throw new BadRequestException('CSV não suporta "all". Selecione uma aba específica ou use XLSX.');
    }

    const file = await this.svc.exportReconciliation(clientId, {
      mesReferencia: mes,
      format,
      tab,
      filters: {
        tipo: !tipo || tipo === 'ALL' ? undefined : tipo,
        plano: plano?.trim() || undefined,
        centro: centro?.trim() || undefined,
      },
    });

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
