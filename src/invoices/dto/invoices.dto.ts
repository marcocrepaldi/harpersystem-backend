import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsBoolean,
  Matches,
  ValidateNested,
} from 'class-validator';
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

  // NOVO: permite filtrar/operar por operadora
  @IsOptional()
  @IsString()
  insurerId?: string;
}

export class ClosurePayloadDTO {
  @Type(() => Number)
  @IsNumber()
  valorTotalInformado!: number;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsBoolean()
  gerarComissoesAgora?: boolean; // default tratado no service
}

export class reconcileInvoicesDTO {
  // ✅ legado: marcar linhas como conciliadas
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invoiceIds?: string[];

  // ✅ novo: abrir snapshot explicitamente
  @IsOptional()
  @IsBoolean()
  openMonth?: boolean;

  // ✅ novo: fechar mês (ação humana)
  @IsOptional()
  @IsBoolean()
  closeMonth?: boolean;

  // ✅ novo: editar dados do fechamento
  @IsOptional()
  @IsBoolean()
  updateClosure?: boolean;

  // mês alvo (YYYY-MM)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'mes deve estar no formato YYYY-MM' })
  mes?: string;

  // dados do fechamento
  @IsOptional()
  @ValidateNested()
  @Type(() => ClosurePayloadDTO)
  closure?: ClosurePayloadDTO;
}
