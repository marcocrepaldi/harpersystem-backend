import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { ReconciliationService } from './reconciliation.service';
import type { Response } from 'express'; // ✅ IMPORT TYPE

@Controller('clients/:clientId/reconciliation')
export class ReconciliationController {
  constructor(private readonly svc: ReconciliationService) {}

  /**
   * GET /api/clients/:clientId/reconciliation?mes=YYYY-MM
   * Cruzamento entre fatura importada e beneficiários ativos (status=ATIVO e dataSaida=null).
   */
  @Get()
  async get(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Query('mes') mes?: string, // YYYY-MM
  ) {
    let mesReferencia: Date | undefined;
    if (mes) {
      const ok = /^\d{4}-\d{2}$/.test(mes);
      if (!ok)
        throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
      const [y, m] = mes.split('-').map((s) => parseInt(s, 10));
      mesReferencia = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    }
    return this.svc.buildReconciliation(clientId, mesReferencia);
  }

  /**
   * GET /api/clients/:clientId/reconciliation/export?mes=YYYY-MM&format=xlsx|csv&tab=mismatched|onlyInInvoice|onlyInRegistry|duplicates|all
   * - CSV: exporta 1 aba (não suporta "all")
   * - XLSX: suporta 1 aba ou "all" (4 abas no workbook)
   */
  @Get('export')
  async export(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Query('mes') mes: string | undefined,
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
    @Query('tab')
    tab:
      | 'mismatched'
      | 'onlyInInvoice'
      | 'onlyInRegistry'
      | 'duplicates'
      | 'all' = 'mismatched',
    @Res() res: Response, // ✅ agora funciona
  ) {
    let mesReferencia: Date | undefined;
    if (mes) {
      const ok = /^\d{4}-\d{2}$/.test(mes);
      if (!ok)
        throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
      const [y, m] = mes.split('-').map((s) => parseInt(s, 10));
      mesReferencia = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    }

    if (format === 'csv' && tab === 'all') {
      throw new BadRequestException(
        'CSV não suporta "all". Selecione uma aba específica ou use XLSX.',
      );
    }

    const file = await this.svc.exportReconciliation(clientId, {
      mesReferencia,
      format,
      tab,
    });

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.setHeader('Content-Type', file.contentType);
    res.send(file.buffer);
  }
}
