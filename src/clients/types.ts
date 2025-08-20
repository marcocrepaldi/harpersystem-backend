export type ClientListItem = {
  id: string;
  name: string;
  email: string | null;
  document: string | null;
  phone: string | null;
  birthDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ClientQuery = {
  search?: string;
  page?: number;
  limit?: number;
};
