import { IsOptional, IsString, IsNumber, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class listImportedInvoicesDTO {
  @IsOptional()
  @IsString()
  mes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;
}

export class reconcileInvoicesDTO {
  @IsArray()
  @IsString({ each: true })
  invoiceIds: string[];
}