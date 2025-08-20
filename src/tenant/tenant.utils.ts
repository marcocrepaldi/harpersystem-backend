export function normalizeSlug(v?: string) {
  return String(v ?? "").trim().toLowerCase();
}

export function normalizeCode(v?: string) {
  return String(v ?? "").trim().toUpperCase();
}

export function extractSlugFromHost(host?: string) {
  if (!host) return "";
  const [hostname] = host.toLowerCase().split(":");
  const parts = hostname.split(".");
  // acme.localhost -> ["acme","localhost"]
  if (hostname.endsWith("localhost") && parts.length >= 2) return parts[0];
  // acme.dominio.com.br -> ["acme","dominio","com","br"]
  if (parts.length >= 3) return parts[0];
  return "";
}
