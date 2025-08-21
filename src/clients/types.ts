// Representa um cliente resumido para listagem
export type ClientListItem = {
  id: string;
  name: string;
  email: string | null;
  document: string | null; // CPF/CNPJ
  phone: string | null;
  birthDate: Date | null;
  status: 'lead' | 'prospect' | 'active' | 'inactive'; // importante para tags de status no UI
  personType: 'PF' | 'PJ'; // pessoa física ou jurídica
  createdAt: Date;
  updatedAt: Date;
};

// Representa os parâmetros de busca, paginação e filtros
export type ClientQuery = {
  // Busca livre
  search?: string;

  // Paginação
  page?: number;
  limit?: number;

  // Filtros específicos
  status?: 'lead' | 'prospect' | 'active' | 'inactive';
  personType?: 'PF' | 'PJ';
  createdFrom?: string; // ISO yyyy-MM-dd (compatível com backend)
  createdTo?: string;   // idem
  hasServiceSlug?: string;
  hasTagSlug?: string;

  // Incluir soft-deletados
  deleted?: boolean;

  // Ordenação
  /** Ex.: "createdAt:desc" | "name:asc" */
  orderBy?: string;
};

// Representa a resposta da listagem de clientes paginada
export type ClientListResponse = {
  items: ClientListItem[];
  page: number;
  limit: number;
  total: number;
};
