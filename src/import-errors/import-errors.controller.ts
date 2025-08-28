import { Controller, Get, Delete, Param, Query } from '@nestjs/common';
import { ImportErrorsService } from './import-errors.service';
import { FindImportErrorsDto } from './dto/find-import-errors.dto';
import { ParseCuidPipe } from '../common/pipes/parse-cuid.pipe';

@Controller('clients/:clientId/import-errors')
export class ImportErrorsController {
  constructor(private readonly importErrorsService: ImportErrorsService) {}

  /** Lista erros de importação para um cliente */
  @Get()
  findMany(
    @Param('clientId', ParseCuidPipe) clientId: string,
    @Query() query: FindImportErrorsDto & { q?: string; query?: string; text?: string },
  ) {
    // normaliza aliases de busca vindos do front (q, query, text)
    const normalized: FindImportErrorsDto = {
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      search: query.search ?? query.q ?? query.query ?? query.text,
    };
    return this.importErrorsService.findMany(clientId, normalized);
  }

  /** Limpa todos os erros de importação para um cliente */
  @Delete()
  clear(@Param('clientId', ParseCuidPipe) clientId: string) {
    return this.importErrorsService.clear(clientId);
  }
}
