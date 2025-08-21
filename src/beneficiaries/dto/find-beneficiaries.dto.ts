import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
  @Max(100)
  limit = 10;

  @IsOptional()
  @IsString()
  search?: string;
}