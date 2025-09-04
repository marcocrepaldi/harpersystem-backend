import { Transform, Type } from 'class-transformer';
import { IsBooleanString, IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';

export class FindBillingRulesQueryDto {
  @IsOptional() @IsString() insurerId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() planId?: string;
  @IsOptional() @IsString() faixaEtaria?: string;
  @IsOptional() @IsString() regime?: 'MENSAL' | 'DIARIO';

  @IsOptional() @IsBooleanString() isActive?: string;

  // mês de referência (YYYY-MM) para filtrar vigência
  @IsOptional() @IsString() mes?: string;

  @IsOptional() @Transform(({value}) => (value ?? 'tradeName')) @IsIn(['createdAt','updatedAt','validFrom'])
  sortBy?: 'createdAt' | 'updatedAt' | 'validFrom' = 'validFrom';

  @IsOptional() @Transform(({value}) => (value ?? 'desc')) @IsIn(['asc','desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number = 24;
}
