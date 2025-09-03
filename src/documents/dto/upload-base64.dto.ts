import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { DocumentCategoryDto } from './create-document.dto';

export class UploadBase64Dto {
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  /** Pode ser "data:...;base64,xxxx" ou apenas "xxxx" */
  @IsString()
  @IsNotEmpty()
  base64!: string;

  @IsOptional()
  @IsIn([
    'APOLICE','PROPOSTA','CONTRATO','FATURA','ANEXO','ADITIVO',
    'BOLETIMDEOCORRENCIA','AVISODESINISTRO','LAUDODEPERICIA',
    'COMUNICADODEACIDENTE','COMPROVANTEDERESIDENCIA',
    'RELATORIODEREGULACAO','DOCUMENTO','OUTRO',
  ])
  category?: DocumentCategoryDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  /** Associação opcional a apólice */
  @IsOptional()
  @IsString()
  policyId?: string;

  /** SHA-256 opcional; se não vier, o service calcula */
  @IsOptional()
  @IsString()
  checksum?: string;
}
