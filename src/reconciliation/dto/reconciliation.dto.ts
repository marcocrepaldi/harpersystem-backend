import { Type, Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

const trim = (v: unknown) =>
  typeof v === 'string' ? v.trim() : v;

/** Converte string vazia em undefined */
const emptyToUndefined = (v: unknown) => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : undefined;
  }
  return v;
};

export class OpenReconciliationDTO {
  @Transform(({ value }) => trim(value))
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'mes deve estar no formato YYYY-MM' })
  mes!: string;
}

export class CloseReconciliationDTO {
  @Transform(({ value }) => trim(value))
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'mes deve estar no formato YYYY-MM' })
  mes!: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0, { message: 'valorFaturaDeclarado não pode ser negativo' })
  valorFaturaDeclarado!: number;

  @Transform(({ value }) => emptyToUndefined(value))
  @IsOptional()
  @IsString()
  observacaoFechamento?: string;

  /** NOVO: permite informar a seguradora */
  @Transform(({ value }) => emptyToUndefined(value))
  @IsOptional()
  @IsString()
  insurerId?: string;
}

export class UpdateCloseReconciliationDTO {
  @Transform(({ value }) => trim(value))
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'mes deve estar no formato YYYY-MM' })
  mes!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0, { message: 'valorFaturaDeclarado não pode ser negativo' })
  valorFaturaDeclarado?: number;

  @Transform(({ value }) => emptyToUndefined(value))
  @IsOptional()
  @IsString()
  observacaoFechamento?: string;

  /** NOVO: permite atualizar fechamento por seguradora */
  @Transform(({ value }) => emptyToUndefined(value))
  @IsOptional()
  @IsString()
  insurerId?: string;
}

export class HistoryQueryDTO {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^\d{4}-\d{2}$/, { message: 'from deve estar no formato YYYY-MM' })
  from?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^\d{4}-\d{2}$/, { message: 'to deve estar no formato YYYY-MM' })
  to?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^(OPEN|CLOSED|ALL)$/i, { message: 'status deve ser OPEN, CLOSED ou ALL' })
  status?: 'OPEN' | 'CLOSED' | 'ALL';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number = 24;

  /** NOVO: permite filtrar histórico por seguradora */
  @Transform(({ value }) => emptyToUndefined(value))
  @IsOptional()
  @IsString()
  insurerId?: string;
}
