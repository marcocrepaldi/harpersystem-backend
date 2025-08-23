import { IsOptional, IsInt, Min, Max, IsEnum, IsString, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BeneficiarioTipo } from '@prisma/client';

export class FindBeneficiariesQueryDto {
  /**
   * Número da página para paginação.
   * @example 1
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /**
   * Número de itens por página.
   * @example 10
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000) // Limite máximo de 1000 para segurança
  limit?: number;

  /**
   * Filtra por tipo de beneficiário (TITULAR ou DEPENDENTE).
   */
  @IsOptional()
  @IsEnum(BeneficiarioTipo)
  tipo?: BeneficiarioTipo;

  /**
   * Termo de busca livre para nome ou CPF.
   */
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Se 'true', ignora a paginação e retorna todos os registros.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  all?: boolean;
}