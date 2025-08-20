// src/modules/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/prisma/prisma.service';

type TenantHint = {
  corretorId?: string;
  subdomain?: string;
  tenantCode?: string;
};

type JwtBasePayload = {
  sub: string;        // userId
  email: string;
  role: string;       // pode tipar com Role do Prisma se quiser
  corretorId: string;
};

type TokenPair = { accessToken: string; refreshToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ------------------------------------------------------------------
  // Login / Refresh / Logout
  // ------------------------------------------------------------------

  /**
   * Login por e-mail/senha (email já normalizado pelo LoginDto).
   * Aceita hint de tenant para desambiguar o e-mail entre tenants.
   */
  async login(email: string, password: string, tenant?: TenantHint): Promise<TokenPair> {
    const user = await this.findUserForLogin(email, tenant);

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive || !user.corretor.isActive) {
      throw new UnauthorizedException('User or tenant inactive');
    }

    const base: JwtBasePayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      corretorId: user.corretorId,
    };

    const tokens = await this.signTokens(base);

    // Rotaciona e guarda o hash do refresh token
    const refreshTokenHash = await this.hash(tokens.refreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return tokens;
  }

  /**
   * Gera novos tokens a partir de um refresh token válido e não revogado.
   * Rotaciona o hash armazenado.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    if (!refreshToken) throw new BadRequestException('Missing refresh token');

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_SECRET,
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload?.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        corretorId: true,
        isActive: true,
        refreshTokenHash: true,
        corretor: { select: { isActive: true } },
      },
    });

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) throw new UnauthorizedException('Refresh token mismatch');

    if (!user.isActive || !user.corretor.isActive) {
      throw new UnauthorizedException('User or tenant inactive');
    }

    const base: JwtBasePayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      corretorId: user.corretorId,
    };

    const tokens = await this.signTokens(base);

    // Rotaciona o hash
    const newHash = await this.hash(tokens.refreshToken);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: newHash },
    });

    return tokens;
  }

  /**
   * Logout: invalida o refresh token atual do usuário (revogação).
   */
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // Compat: wrapper usado pelo controller /auth/bootstrap-admin
  // ------------------------------------------------------------------

  /**
   * Compatibilidade com controllers que esperam issueTokens().
   * Apenas assina os tokens com o payload fornecido.
   */
  async issueTokens(payload: {
    userId: string;
    corretorId: string;
    role: string;
    email: string;
  }): Promise<TokenPair> {
    const base: JwtBasePayload = {
      sub: payload.userId,
      email: payload.email,
      role: payload.role,
      corretorId: payload.corretorId,
    };
    return this.signTokens(base);
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private async findUserForLogin(email: string, tenant?: TenantHint) {
    // 1) Hint direto por corretorId (mais preciso)
    if (tenant?.corretorId) {
      const u = await this.prisma.user.findFirst({
        where: { email, corretorId: tenant.corretorId },
        include: { corretor: { select: { id: true, isActive: true } } },
      });
      if (!u) throw new UnauthorizedException('Invalid credentials');
      return u;
    }

    // 2) Resolver tenant por subdomain/tenantCode
    if (tenant?.subdomain || tenant?.tenantCode) {
      const corretor = await this.prisma.corretor.findFirst({
        where: {
          ...(tenant.subdomain ? { subdomain: tenant.subdomain } : {}),
          ...(tenant.tenantCode ? { tenantCode: tenant.tenantCode } : {}),
        },
        select: { id: true, isActive: true },
      });
      if (!corretor) throw new UnauthorizedException('Tenant not found');

      const u = await this.prisma.user.findFirst({
        where: { email, corretorId: corretor.id },
        include: { corretor: { select: { id: true, isActive: true } } },
      });
      if (!u) throw new UnauthorizedException('Invalid credentials');
      return u;
    }

    // 3) Sem hint: tentar por e-mail e detectar ambiguidade entre tenants
    const users = await this.prisma.user.findMany({
      where: { email },
      include: { corretor: { select: { id: true, isActive: true } } },
      take: 2, // detectar rapidamente duplicidade
    });

    if (users.length === 0) throw new UnauthorizedException('Invalid credentials');
    if (users.length > 1) {
      throw new UnauthorizedException('Ambiguous email across tenants');
    }

    return users[0];
  }

  private async signTokens(base: JwtBasePayload): Promise<TokenPair> {
    const common = {
      secret: process.env.JWT_SECRET,
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
    };

    const accessToken = await this.jwt.signAsync(base, {
      ...common,
      expiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
    });

    const refreshToken = await this.jwt.signAsync({ ...base, typ: 'refresh' }, {
      ...common,
      expiresIn: process.env.REFRESH_TOKEN_TTL || '7d',
    });

    return { accessToken, refreshToken };
    // Se o frontend preferir snake_case:
    // return { access_token: accessToken, refresh_token: refreshToken } as any;
  }

  private async hash(value: string) {
    return bcrypt.hash(value, 10);
  }
}
