import { Controller, Get, Param, Query, BadRequestException } from '@nestjs/common';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { ReconciliationService } from './reconciliation.service';

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
      if (!ok) throw new BadRequestException('Parâmetro "mes" inválido. Use YYYY-MM.');
      const [y, m] = mes.split('-').map((s) => parseInt(s, 10));
      mesReferencia = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    }
    return this.svc.buildReconciliation(clientId, mesReferencia);
  }
}
