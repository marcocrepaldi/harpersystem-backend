import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePlanDto {
  /** slug único, ex.: "UNIMED-NACIONAL" */
  @IsString()
  @IsNotEmpty()
  slug!: string;

  /** Nome de exibição do plano */
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePlanAliasDto {
  /** Alias normalizado para casar com planilhas (guarde sem acentos/caixa) */
  @IsString()
  @IsNotEmpty()
  alias!: string;
}

export class CreatePlanPriceDto {
  /** ID do plano (será preenchido pela rota /:planId/prices) */
  @IsString()
  @IsNotEmpty()
  planId!: string;

  /** Início da vigência (ISO yyyy-mm-dd) */
  @IsString()
  @IsNotEmpty()
  vigenciaInicio!: string;

  /** Fim da vigência (ISO) — opcional / aberto */
  @IsOptional()
  @IsString()
  vigenciaFim?: string;

  /** Faixa etária opcional (ex.: "29-33", "59+") */
  @IsOptional()
  @IsString()
  faixaEtaria?: string;

  /** Valor (string compatível com Decimal) — aceita "1234.56" ou "1234,56" */
  @IsString()
  @IsNotEmpty()
  valor!: string;

  /** Regime de cobrança (se aplicável) */
  @IsOptional()
  @IsString()
  regimeCobranca?: 'MENSAL' | 'DIARIO';
}

export class UpdatePlanPriceDto {
  @IsOptional()
  @IsString()
  vigenciaInicio?: string;

  @IsOptional()
  @IsString()
  vigenciaFim?: string;

  @IsOptional()
  @IsString()
  faixaEtaria?: string;

  @IsOptional()
  @IsString()
  valor?: string;

  @IsOptional()
  @IsString()
  regimeCobranca?: 'MENSAL' | 'DIARIO';
}
