import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertClientPlanDto {
  @IsString() @IsNotEmpty()
  planId!: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateClientPlanPriceDto {
  @IsString() @IsNotEmpty()
  planId!: string;

  @IsString() @IsNotEmpty()
  vigenciaInicio!: string;   // ← obrigatório de novo

  @IsOptional() @IsString()
  vigenciaFim?: string;

  @IsOptional() @IsString()
  faixaEtaria?: string;

  @IsString() @IsNotEmpty()
  valor!: string;

  @IsOptional() @IsString()
  regimeCobranca?: 'MENSAL' | 'DIARIO';
}
