/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  DefaultValuePipe,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  Delete,
  Patch,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BeneficiariesService } from './beneficiaries.service';

type PageResult<T> = { items: T[]; page: number; limit: number; total: number };

/* ---------------- helpers só para o PATCH ---------------- */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function toDate(value: any): Date | undefined {
  if (value == null || String(value).trim() === '') return undefined;
  let s = String(value).trim();
  if (DATE_RE.test(s)) s = `${s}T00:00:00.000Z`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}
const onlyDigits = (s: any) => String(s ?? '').replace(/\D/g, '');
const nullIfEmpty = (v: any) => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};
function normalizeTipo(v: any) {
  const s = String(v ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim();
  if (!s) return undefined;
  if (s === 'DEPENDENTE') return 'FILHO';
  if (s === 'CONJUGUE' || s === 'CONJUGE') return 'CONJUGE';
  if (s === 'FILHO' || s === 'CONJUGE' || s === 'TITULAR') return s;
  return undefined;
}

@Controller('clients/:clientId/beneficiaries')
export class BeneficiariesController {
  constructor(private readonly svc: BeneficiariesService) {}

  // ================== LISTAGEM ==================
  @Get()
  async list(
    @Param('clientId') clientId: string,
    @Query('search') search?: string,
    @Query('tipo') tipo?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(1000), ParseIntPipe) limit = 1000,
  ): Promise<PageResult<any>> {
    return this.svc.list(clientId, { search, tipo, status, page, limit });
  }

  // ================== BUSCA POR ID ==================
  @Get(':beneficiaryId')
  async findOne(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    const delegate = (this.svc as any).beneficiaryDelegate;
    if (!delegate) {
      throw new BadRequestException('Delegate Prisma para beneficiários não encontrado.');
    }
    return delegate.findFirstOrThrow({ where: { id: beneficiaryId, clientId } });
  }

  // ================== ATUALIZAÇÃO ==================
  @Patch(':beneficiaryId')
  async update(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body() dto: any,
  ) {
    const delegate = (this.svc as any).beneficiaryDelegate;
    if (!delegate) {
      throw new BadRequestException('Delegate Prisma para beneficiários não encontrado.');
    }

    // monta um "data" seguro para o Prisma (sem alterar as outras rotas)
    const data: Record<string, any> = { clientId };

    if (dto.nomeCompleto !== undefined) data.nomeCompleto = nullIfEmpty(dto.nomeCompleto);
    if (dto.cpf !== undefined) {
      const digits = onlyDigits(dto.cpf);
      data.cpf = digits.length ? digits : null;
    }
    if (dto.tipo !== undefined) {
      const t = normalizeTipo(dto.tipo);
      if (t) data.tipo = t; // "FILHO" | "CONJUGE" | "TITULAR"
    }

    if (dto.dataEntrada !== undefined) {
      const d = toDate(dto.dataEntrada);
      if (!d) throw new BadRequestException('dataEntrada inválida (use YYYY-MM-DD).');
      data.dataEntrada = d;
    }
    if (dto.dataNascimento !== undefined) {
      const d = toDate(dto.dataNascimento);
      data.dataNascimento = d ?? null;
    }
    if (dto.dataSaida !== undefined) {
      const d = toDate(dto.dataSaida);
      data.dataSaida = d ?? null;
      // se quiser, pode forçar INATIVO quando houver saída (opcional)
      // if (d && dto.status === undefined) data.status = 'INATIVO';
    }

    if (dto.valorMensalidade !== undefined) data.valorMensalidade = nullIfEmpty(dto.valorMensalidade);
    if (dto.titularId !== undefined) data.titularId = nullIfEmpty(dto.titularId);

    if (dto.matricula !== undefined) data.matricula = nullIfEmpty(dto.matricula);
    if (dto.carteirinha !== undefined) data.carteirinha = nullIfEmpty(dto.carteirinha);
    if (dto.sexo !== undefined) data.sexo = nullIfEmpty(dto.sexo);
    if (dto.plano !== undefined) data.plano = nullIfEmpty(dto.plano);
    if (dto.centroCusto !== undefined) data.centroCusto = nullIfEmpty(dto.centroCusto);
    if (dto.faixaEtaria !== undefined) data.faixaEtaria = nullIfEmpty(dto.faixaEtaria);
    if (dto.estado !== undefined) data.estado = nullIfEmpty(dto.estado);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.regimeCobranca !== undefined) data.regimeCobranca = dto.regimeCobranca;
    if (dto.motivoMovimento !== undefined) data.motivoMovimento = dto.motivoMovimento;
    if (dto.observacoes !== undefined) data.observacoes = dto.observacoes ?? null;

    return delegate.update({
      where: { id: beneficiaryId },
      data,
    });
  }

  // ================== EXCLUSÃO ==================
  @Delete(':beneficiaryId')
  async remove(
    @Param('clientId') clientId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.svc.remove(clientId, beneficiaryId);
  }

  // ================== EXCLUSÃO EM LOTE ==================
  @Post('bulk-delete')
  async bulkDelete(
    @Param('clientId') clientId: string,
    @Body() body: { ids?: string[] },
  ) {
    const ids = body?.ids ?? [];
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Envie { ids: string[] } com pelo menos 1 id.');
    }
    return this.svc.removeMany(clientId, ids);
  }

  // ================== UPLOAD DE BENEFICIÁRIOS ==================
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('clientId') clientId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo (form field "file") é obrigatório.');
    return this.svc.upload(clientId, file);
  }

  // ================== CONSULTA DE IMPORTAÇÕES ==================
  @Get('imports/latest')
  async getLatestImport(@Param('clientId') clientId: string) {
    return this.svc.getLatestImportRun(clientId);
  }

  @Get('imports/run/:runId')
  async getImportById(
    @Param('clientId') clientId: string,
    @Param('runId') runId: string,
  ) {
    return this.svc.getImportRun(clientId, runId);
  }

  @Delete('imports/run/:runId')
  async deleteImportById(
    @Param('clientId') clientId: string,
    @Param('runId') runId: string,
  ) {
    return this.svc.deleteImportRun(clientId, runId);
  }

  @Delete('imports')
  async clearAllImports(@Param('clientId') clientId: string) {
    return this.svc.clearAllImportRuns(clientId);
  }
}
