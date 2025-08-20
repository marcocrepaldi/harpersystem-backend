export type TenantInfo = {
  id: string;
  slug: string;
  tenantCode?: string | null;
  subdomain: string;
  isActive: boolean;
};
