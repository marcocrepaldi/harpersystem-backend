import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsString,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BeneficiarioTipo, BeneficiarioStatus } from '@prisma/client';

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

  /**
   * Aceita "TITULAR", "FILHO", "CONJUGE" e também o legado "DEPENDENTE"
   * (service mapeia p/ [FILHO, CONJUGE]).
   */
  @IsOptional()
  @IsEnum(BeneficiarioTipo)
  tipo?: BeneficiarioTipo | 'DEPENDENTE';

  @IsOptional()
  @IsEnum(BeneficiarioStatus)
  status?: BeneficiarioStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  all?: boolean;
}
