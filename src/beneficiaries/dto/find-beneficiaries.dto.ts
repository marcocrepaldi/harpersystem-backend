import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Enum para garantir que o filtro 'tipo' só aceite os valores corretos
enum BeneficiarioTipoDto {
  TITULAR = 'TITULAR',
  DEPENDENTE = 'DEPENDENTE',
}

// Helper para transformar string em número para validação
const toInt = ({ value }: { value: unknown }) => {
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? undefined : n;
};

export class FindBeneficiariesQueryDto {
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 10;

  @IsOptional()
  @IsString()
  search?: string;

  // ✅ CAMPO QUE FALTAVA ADICIONADO AQUI
  @IsOptional()
  @IsEnum(BeneficiarioTipoDto, { message: 'O tipo deve ser TITULAR ou DEPENDENTE.' })
  tipo?: BeneficiarioTipoDto;
}