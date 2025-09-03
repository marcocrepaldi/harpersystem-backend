import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';
import { ReconciliationService } from './reconciliation.service';
import { CloseReconciliationDTO, OpenReconciliationDTO } from './dto/reconciliation.dto';

type TipoParam = 'TITULAR' | 'DEPENDENTE' | 'ALL';

function parseCurrencyToNumber(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim();
  if (!s) return NaN;
  const raw = s.replace(/[^\d.,\-]/g, '');
  if (!raw) return NaN;
  if (raw.includes(',')) {
    const n = Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

/** Aceita tanto {valorFaturaDeclarado, observacaoFechamento} quanto {totalFatura, observacoes} */
function normalizeCloseBody(
  body: any,
): { mes: string; totalFatura: number; observacoes?: string } {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('Payload inválido.');
  }

  const mes: string = String(body.mes ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    throw new BadRequestException('mes inválido. Use YYYY-MM.');
  }

  const declared =
    body.valorFaturaDeclarado != null ? body.valorFaturaDeclarado : body.totalFatura;
  const notes =
    body.observacaoFechamento != null ? body.observacaoFechamento : body.observacoes;

  const total = parseCurrencyToNumber(declared);
  if (!Number.isFinite(total) || total < 0) {
    throw new BadRequestException('totalFatura inválido.');
  }

  const observacoes =
    typeof notes === 'string' && notes.trim().length ? notes.trim() : undefined;

  return { mes, totalFatura: total, observacoes };
}

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
      mesReferencia: mes,
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

  // ---- Fechar mês (aceita ambos formatos de body) ----
  @Post('close')
  async closeManual(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Body() body: CloseReconciliationDTO | { mes: string; totalFatura: number; observacoes?: string },
  ) {
    const normalized = normalizeCloseBody(body);
    return this.svc.closeManual(clientId, normalized, undefined);
  }

  // ---- Reabrir mês ----
  @Post('reopen')
  async reopen(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Body() dto: OpenReconciliationDTO, // { mes: 'YYYY-MM' }
  ) {
    return this.svc.reopen(clientId, { mes: dto.mes }, undefined);
  }

  // ---- Histórico (consulta paginada) ----
  @Get('history')
  async history(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Query('from') fromYM?: string,
    @Query('to') toYM?: string,
    @Query('status') status?: 'OPEN' | 'CLOSED' | 'ALL',
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
    @Query('order') order: 'asc' | 'desc' = 'desc',
  ) {
    const ymOk = (s?: string) => !s || /^\d{4}-\d{2}$/.test(s);
    if (!ymOk(fromYM) || !ymOk(toYM)) {
      throw new BadRequestException('from/to devem estar no formato YYYY-MM');
    }
    const page = Math.max(1, Number(pageStr ?? 1) || 1);
    const limit = Math.min(200, Math.max(1, Number(limitStr ?? 24) || 24));
    const st = status && status !== 'ALL' ? status : undefined;

    return this.svc.listHistory(clientId, {
      fromYM,
      toYM,
      page,
      limit,
      status: st as any,
      order,
    });
  }

  // ---- Export do histórico ----
  @Get('history/export')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async exportHistory(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Query('from') fromYM?: string,
    @Query('to') toYM?: string,
    @Query('status') status?: 'OPEN' | 'CLOSED' | 'ALL',
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
  ): Promise<StreamableFile> {
    const ymOk = (s?: string) => !s || /^\d{4}-\d{2}$/.test(s);
    if (!ymOk(fromYM) || !ymOk(toYM)) {
      throw new BadRequestException('from/to devem estar no formato YYYY-MM');
    }
    const st = status && status !== 'ALL' ? status : undefined;

    const file = await this.svc.exportHistory(clientId, {
      fromYM,
      toYM,
      status: st as any,
      format,
    });

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
