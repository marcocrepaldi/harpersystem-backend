import { IsArray, IsBoolean, IsOptional, IsString, IsUrl, Length, Matches, MaxLength, ArrayNotEmpty, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { InsuranceLine } from '@prisma/client';

export class CreateInsurerDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug deve conter apenas minúsculas, números e hífens (ex.: amil, bradesco-saude)',
  })
  @Length(2, 64)
  slug!: string;

  @IsString()
  @MaxLength(200)
  legalName!: string;

  @IsString()
  @MaxLength(120)
  tradeName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  // CNPJ livre (deixe a normalização no backend, se quiser)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  // Código ANS (quando aplicável)
  ansCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(InsuranceLine, { each: true })
  @Type(() => String)
  lines?: InsuranceLine[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: 'website deve ser uma URL válida (https://...)' })
  @MaxLength(300)
  website?: string;
}
