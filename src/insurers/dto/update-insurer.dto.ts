import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ArrayNotEmpty,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InsuranceLine } from '@prisma/client';

export class UpdateInsurerDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @Length(2, 64)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
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
  @IsUrl({ require_protocol: true })
  @MaxLength(300)
  website?: string;

  // controle de concorrência otimista
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}
