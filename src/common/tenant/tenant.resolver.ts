// src/.../tenant.resolver.ts
import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class TenantResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(req: any, user?: { corretorId?: string }): Promise<string> {
    // 1) JWT (continua com prioridade)
    if (user?.corretorId) return user.corretorId;

    // 2) x-tenant-id (aceita UUID v4 ou CUID/cuid2)
    const rawId = (req?.headers?.['x-tenant-id'] as string | undefined)?.trim();
    if (rawId) {
      const isUuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId);
      const isCuid = /^c[a-z0-9]{24,}$/i.test(rawId); // cuid/cuid2 (ex.: "cm...") 
      if (!isUuidV4 && !isCuid) throw new BadRequestException('x-tenant-id inválido.');
      return rawId;
    }

    // 3) slug por header (aceita slug OU subdomain; mantém compat)
    const slug =
      (req?.headers?.['x-tenant-slug'] as string | undefined) ??
      (req?.headers?.['x-tenant-subdomain'] as string | undefined) ??
      (req?.headers?.['x-tenant'] as string | undefined);

    if (slug) {
      const corretor = await this.prisma.corretor.findFirst({
        where: { OR: [{ subdomain: slug }, { tenantCode: slug }] },
        select: { id: true, isActive: true },
      });
      if (!corretor || !corretor.isActive) {
        throw new UnauthorizedException('Tenant inválido ou inativo.');
      }
      return corretor.id;
    }

    // (opcional) fallback via query ?tenant=abc
    const qSlug = req?.query?.tenant as string | undefined;
    if (qSlug) {
      const corretor = await this.prisma.corretor.findFirst({
        where: { OR: [{ subdomain: qSlug }, { tenantCode: qSlug }] },
        select: { id: true, isActive: true },
      });
      if (corretor?.isActive) return corretor.id;
    }

    throw new UnauthorizedException(
      'Corretor ID não encontrado. O token da autenticação pode estar inválido.',
    );
  }
}
