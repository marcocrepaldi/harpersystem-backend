import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpsertClientPlanDto {
  /** Plano a vincular ao cliente */
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateClientPlanPriceDto {
  /** Plano vinculado (preenchido pela rota /clients/:clientId/plans/:planId/prices) */
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsString()
  @IsNotEmpty()
  vigenciaInicio!: string;

  @IsOptional()
  @IsString()
  vigenciaFim?: string;

  @IsOptional()
  @IsString()
  faixaEtaria?: string;

  @IsString()
  @IsNotEmpty()
  valor!: string;

  @IsOptional()
  @IsString()
  regimeCobranca?: 'MENSAL' | 'DIARIO';
}
