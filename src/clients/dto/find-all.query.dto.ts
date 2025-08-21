import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

// --------- Helpers de transformação ---------
function toInt({ value }: { value: unknown }) {
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? undefined : n;
}

function toBool({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return undefined;
}

function toDate({ value }: { value: unknown }) {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function emptyToUndef({ value }: { value: unknown }) {
  const s = String(value ?? '').trim();
  return s.length ? s : undefined;
}

export class FindClientsQueryDto {
  // Paginação
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  // Busca livre
  @IsOptional()
  @Transform(emptyToUndef)
  @IsString()
  search?: string;

  // Filtros (compatível com o form)
  // status: 'lead' | 'prospect' | 'active' | 'inactive'
  @IsOptional()
  @Transform(emptyToUndef)
  @IsIn(['lead', 'prospect', 'active', 'inactive'])
  status?: 'lead' | 'prospect' | 'active' | 'inactive';

  // personType: 'PF' | 'PJ'
  @IsOptional()
  @Transform(emptyToUndef)
  @IsIn(['PF', 'PJ'])
  personType?: 'PF' | 'PJ';

  // Janela de criação
  @IsOptional()
  @Transform(toDate)
  @IsDate()
  createdFrom?: Date;

  @IsOptional()
  @Transform(toDate)
  @IsDate()
  createdTo?: Date;

  // Filtros N:N por slug
  @IsOptional()
  @Transform(emptyToUndef)
  @IsString()
  hasServiceSlug?: string;

  @IsOptional()
  @Transform(emptyToUndef)
  @IsString()
  hasTagSlug?: string;

  // Incluir soft-deleted
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  deleted?: boolean;

  /**
   * Ordenação: "campo:direcao"
   * Campos: createdAt | name | status
   * Direção: asc | desc
   * Ex.: createdAt:desc, name:asc
   */
  @IsOptional()
  @Transform(emptyToUndef)
  @Matches(/^(createdAt|name|status):(asc|desc)$/i, {
    message:
      'orderBy deve ser "createdAt|name|status:asc|desc" (ex.: "createdAt:desc").',
  })
  orderBy?: string;
}
