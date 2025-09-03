import { IsString, IsOptional, IsArray, IsNumber, IsIn, MaxLength } from 'class-validator';

const CATEGORIES = [
  'APOLICE', 'PROPOSTA', 'CONTRATO', 'FATURA', 'ANEXO', 'ADITIVO',
  'BOLETIMDEOCORRENCIA', 'AVISODESINISTRO', 'LAUDODEPERICIA', 'COMUNICADODEACIDENTE',
  'COMPROVANTEDERESIDENCIA', 'RELATORIODEREGULACAO', 'DOCUMENTO', 'OUTRO',
] as const;
export type DocumentCategory = typeof CATEGORIES[number];

export class CreateDocumentBase64Dto {
  @IsString() dataBase64!: string; // data:<mime>;base64,<...> ou base64 puro

  @IsString() @MaxLength(255) filename!: string; // nome original sugerido

  @IsOptional() @IsString() mimeType?: string;   // opcional, será inferido do dataURL se vier

  @IsOptional() @IsNumber() size?: number;       // opcional, usamos o buffer.length se não vier

  @IsOptional() @IsIn(CATEGORIES as unknown as string[]) category?: DocumentCategory;

  @IsOptional() @IsArray() tags?: string[];

  @IsOptional() @IsString() @MaxLength(2000) notes?: string;

  @IsOptional() @IsString() policyId?: string;
}
