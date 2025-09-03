import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export type DocumentCategoryDto =
  | 'APOLICE'
  | 'PROPOSTA'
  | 'CONTRATO'
  | 'FATURA'
  | 'ANEXO'
  | 'ADITIVO'
  | 'BOLETIMDEOCORRENCIA'
  | 'AVISODESINISTRO'
  | 'LAUDODEPERICIA'
  | 'COMUNICADODEACIDENTE'
  | 'COMPROVANTEDERESIDENCIA'
  | 'RELATORIODEREGULACAO'
  | 'DOCUMENTO'
  | 'OUTRO';

export class CreateDocumentDto {
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsInt()
  @Min(0)
  size!: number;

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

  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @IsOptional()
  @IsString()
  checksum?: string;

  @IsOptional()
  @IsString()
  policyId?: string;
}
