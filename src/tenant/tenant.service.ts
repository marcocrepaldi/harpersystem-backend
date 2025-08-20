import { Injectable, ForbiddenException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import { TenantInfo } from "./tenant.types";
import { extractSlugFromHost, normalizeCode, normalizeSlug } from "./tenant.utils";

type CacheEntry = { tenant: TenantInfo; exp: number };

function headerToString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0) return String(v[0]);
  return undefined;
}

@Injectable()
export class TenantService {
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;

  constructor(private prisma: PrismaService, cfg: ConfigService) {
    const raw = Number(cfg.get("TENANT_CACHE_TTL_MS") ?? 30000);
    // TTL mínimo de 1s e máximo de 10min para evitar valores ruins em produção
    this.ttlMs = Math.min(Math.max(isFinite(raw) ? raw : 30000, 1000), 10 * 60 * 1000);
  }

  /**
   * Resolve o tenant a partir do request:
   * 1) x-tenant-slug
   * 2) host (subdomínio)
   * 3) x-tenant-code
   *
   * Se slug e code forem enviados e divergirem, lança erro.
   * Anexa req.tenant e req.tenantId.
   */
  async getTenantFromRequest(req: any): Promise<TenantInfo> {
    const headers = (req?.headers ?? {}) as Record<string, unknown>;

    const rawHeaderSlug = headerToString(headers["x-tenant-slug"]);
    const rawHeaderCode = headerToString(headers["x-tenant-code"]);
    const rawHost = headerToString(headers["host"]);

    const headerSlug = normalizeSlug(rawHeaderSlug);
    const headerCode = normalizeCode(rawHeaderCode);
    const hostSlug = normalizeSlug(extractSlugFromHost(rawHost));

    if (!headerSlug && !headerCode && !hostSlug) {
      throw new ForbiddenException("Tenant não informado (x-tenant-slug/x-tenant-code ausente).");
    }

    // Prioridade: headerSlug > hostSlug > headerCode
    const chosenSlug = headerSlug || hostSlug;

    let tenant: TenantInfo | null = null;

    if (chosenSlug) {
      tenant = await this.findBySlug(chosenSlug);
      if (!tenant) {
        throw new ForbiddenException(`Tenant não encontrado para slug: ${chosenSlug}`);
      }
      // Se também veio code, checar consistência (opcional, mas evita confusão)
      if (headerCode && tenant.tenantCode && normalizeCode(tenant.tenantCode) !== headerCode) {
        throw new BadRequestException(
          `Inconsistência de tenant: slug="${chosenSlug}" não corresponde ao x-tenant-code enviado.`
        );
      }
    } else if (headerCode) {
      tenant = await this.findByCode(headerCode);
      if (!tenant) {
        throw new ForbiddenException(`Tenant não encontrado para code: ${headerCode}`);
      }
    }

    if (!tenant || !tenant.isActive) {
      throw new ForbiddenException("Tenant inválido ou inativo.");
    }

    // Sugar para controllers/guards/serviços
    req.tenant = tenant;
    req.tenantId = tenant.id;

    return tenant;
  }

  async findBySlug(slug?: string | null): Promise<TenantInfo | null> {
    if (!slug) return null;
    const key = `slug:${slug}`;
    const hit = this.getCache(key);
    if (hit) return hit;

    const t = await this.prisma.corretor.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        tenantCode: true,
        subdomain: true,
        isActive: true,
        // name: true, // habilite se quiser retornar também
      },
    });

    // Opcional: se achou por slug, prime o cache por code também
    if (t?.tenantCode) this.setCache(`code:${normalizeCode(t.tenantCode)}`, t);

    return this.setCache(key, t);
  }

  async findByCode(code?: string | null): Promise<TenantInfo | null> {
    if (!code) return null;
    const key = `code:${code}`;
    const hit = this.getCache(key);
    if (hit) return hit;

    const t = await this.prisma.corretor.findUnique({
      where: { tenantCode: code },
      select: {
        id: true,
        slug: true,
        tenantCode: true,
        subdomain: true,
        isActive: true,
      },
    });

    // Prime também por slug
    if (t?.slug) this.setCache(`slug:${t.slug}`, t);

    return this.setCache(key, t);
  }

  /** Utilitários de cache */

  private getCache(key: string): TenantInfo | null {
    const now = Date.now();
    const entry = this.cache.get(key);
    if (entry && entry.exp > now) return entry.tenant;
    if (entry) this.cache.delete(key);
    return null;
  }

  private setCache(key: string, t: TenantInfo | null): TenantInfo | null {
    if (!t) return null;
    this.cache.set(key, { tenant: t, exp: Date.now() + this.ttlMs });
    return t;
  }

  /** Para invalidação manual (ex.: após atualizar um tenant) */
  invalidateBySlug(slug: string) {
    this.cache.delete(`slug:${slug}`);
  }
  invalidateByCode(code: string) {
    this.cache.delete(`code:${normalizeCode(code)}`);
  }
  clearCache() {
    this.cache.clear();
  }
}
