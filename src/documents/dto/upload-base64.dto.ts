import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import type { DocumentCategoryDto } from './create-document.dto';

const BASE64_OR_DATAURL_REGEX =
  /^(?:data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=\r\n]+|[A-Za-z0-9+/=\r\n]+)$/;

export class UploadBase64Dto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  /** Pode ser "data:...;base64,xxxx" ou apenas "xxxx" */
  @IsString()
  @IsNotEmpty()
  @Matches(BASE64_OR_DATAURL_REGEX, { message: 'base64 inválido (aceita data URL ou base64 puro).' })
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
  @MaxLength(2000)
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
