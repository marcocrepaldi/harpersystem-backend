import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import type { DocumentCategoryDto } from './create-document.dto';

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  filename?: string;

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
}
