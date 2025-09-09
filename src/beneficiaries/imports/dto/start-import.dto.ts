import { IsOptional, IsString } from 'class-validator';

export class StartImportDto {
  // ID externo opcional (ex.: id do job, hash do arquivo, etc.)
  @IsOptional()
  @IsString()
  runId?: string;

  // Payload livre da importação (estrutura que você já monta hoje)
  // Usamos `any` para não engessar; se quiser, tipa depois.
  payload: any;
}
