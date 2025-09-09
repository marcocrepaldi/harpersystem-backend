import {
  IsOptional, IsInt, Min, Max, IsEnum, IsString, IsBoolean, IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BeneficiarioStatus } from '@prisma/client';

const normalizeStr = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  return s.length ? s : undefined;
};

const normalizeTipo = (v: unknown):
  | 'TITULAR'
  | 'FILHO'
  | 'CONJUGE'
  | 'DEPENDENTE'
  | undefined => {
  const s = normalizeStr(v);
  if (!s || s === 'ALL' || s === 'TODOS') return undefined;
  if (s.startsWith('TITULAR')) return 'TITULAR';
  if (s.startsWith('FILHO')) return 'FILHO';
  if (s.startsWith('CONJUGE')) return 'CONJUGE';
  if (s.startsWith('DEPENDENTE')) return 'DEPENDENTE';
  return undefined;
};

const normalizeStatus = (v: unknown): BeneficiarioStatus | undefined => {
  const s = normalizeStr(v);
  if (!s || s === 'ALL' || s === 'TODOS') return undefined;
  if (s === 'ATIVO') return BeneficiarioStatus.ATIVO;
  if (s === 'INATIVO') return BeneficiarioStatus.INATIVO;
  return undefined;
};

const toBool = (v: unknown): boolean | undefined => {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1') return true;
  if (v === 0 || v === '0') return false;
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return undefined;
  if (['true', 't', 'yes', 'y', 'on', 'sim'].includes(s)) return true;
  if (['false', 'f', 'no', 'n', 'off', 'nao', 'não'].includes(s)) return false;
  return undefined;
};

export class FindBeneficiariesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => normalizeTipo(value))
  @IsIn(['TITULAR', 'FILHO', 'CONJUGE', 'DEPENDENTE'])
  tipo?: 'TITULAR' | 'FILHO' | 'CONJUGE' | 'DEPENDENTE';

  @IsOptional()
  @Transform(({ value }) => normalizeStatus(value))
  @IsEnum(BeneficiarioStatus)
  status?: BeneficiarioStatus;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return undefined;
    const s = value.trim();
    return s.length ? s : undefined;
  })
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  all?: boolean;
}
