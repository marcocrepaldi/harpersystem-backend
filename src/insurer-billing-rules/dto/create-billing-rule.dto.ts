import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateBillingRuleDto {
  @IsString()
  insurerId!: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  faixaEtaria?: string;

  @IsOptional()
  @IsIn(['MENSAL', 'DIARIO'])
  regime?: 'MENSAL' | 'DIARIO';

  // Política livre (validada superficialmente como objeto)
  @IsObject()
  policy!: Record<string, any>;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  validFrom?: string; // default: now

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  version?: number;
}
