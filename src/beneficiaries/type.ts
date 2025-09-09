export type DiffScope = 'core' | 'operadora';
export type Diff = { scope: DiffScope; field: string; before: any; after: any };

export type UpdatedDetail = {
  row: number;
  id: string;
  cpf?: string | null;
  nome?: string | null;
  tipo?: string | null;
  matchBy: 'CPF' | 'NOME_DTNASC';
  changed: Diff[];
};

export type UploadSummary = {
  totalLinhas: number;
  processados: number;
  criados: number;
  atualizados: number;
  rejeitados: number;
  atualizadosPorCpf: number;
  atualizadosPorNomeData: number;
  duplicadosNoArquivo: { cpf: string; ocorrencias: number }[];
  porMotivo?: { motivo: string; count: number }[];
  porTipo?: {
    titulares: { criados: number; atualizados: number };
    dependentes: { criados: number; atualizados: number };
  };
};

export type UploadResult = {
  ok: boolean;
  runId: string;
  summary: UploadSummary;
  errors: Array<{ row: number; motivo: string; dados?: any }>;
  updatedDetails: UpdatedDetail[];
  duplicatesInFile: { cpf: string; rows: number[] }[];
};
