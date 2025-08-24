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

  /**
   * GET /api/clients/:clientId/reconciliation?mes=YYYY-MM&tipo=TITULAR|DEPENDENTE|ALL&plano=&centro=
   */
  @Get()
  async get(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Query('mes') mes?: string, // YYYY-MM
    @Query('tipo') tipo?: TipoParam,
    @Query('plano') plano?: string,
    @Query('centro') centro?: string,
  ) {
    let mesReferencia: Date | undefined;

    if (mes) {
      const ok = /^\d{4}-\d{2}$/.test(mes);
      if (!ok) {
        throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
      }
      const [y, m] = mes.split('-').map((s) => parseInt(s, 10));
      mesReferencia = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    }

    return this.svc.buildReconciliation(clientId, {
      mesReferencia,
      filters: {
        tipo: !tipo || tipo === 'ALL' ? undefined : tipo,
        plano: plano?.trim() || undefined,
        centro: centro?.trim() || undefined,
      },
    });
  }

  /**
   * GET /api/clients/:clientId/reconciliation/options
   * Retorna opções distintas para filtros (plano, centro, tipos).
   */
  @Get('options')
  async options(@Param('clientId', ParseCuidPipe) clientId: string) {
    return this.svc.getFilterOptions(clientId);
  }

  /**
   * GET /api/clients/:clientId/reconciliation/export
   * Query:
   *  - mes=YYYY-MM
   *  - format=xlsx|csv (default xlsx)
   *  - tab=mismatched|onlyInInvoice|onlyInRegistry|duplicates|all (default mismatched)
   *  - tipo=TITULAR|DEPENDENTE|ALL (default ALL)
   *  - plano, centro (opcionais)
   *
   * Retorna arquivo (XLSX/CSV) já com filtros aplicados.
   */
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
      | 'all' = 'mismatched',
    @Query('tipo') tipo?: TipoParam,
    @Query('plano') plano?: string,
    @Query('centro') centro?: string,
  ): Promise<StreamableFile> {
    let mesReferencia: Date | undefined;

    if (mes) {
      const ok = /^\d{4}-\d{2}$/.test(mes);
      if (!ok) {
        throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
      }
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
      filters: {
        tipo: !tipo || tipo === 'ALL' ? undefined : tipo,
        plano: plano?.trim() || undefined,
        centro: centro?.trim() || undefined,
      },
    });

    // StreamableFile permite definir type/disposition dinamicamente sem usar @Res
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
