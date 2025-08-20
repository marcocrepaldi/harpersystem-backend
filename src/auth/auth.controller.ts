// src/auth/auth.controller.ts (adicione este método)
import {
  Body,
  Controller,
  Headers,
  Post,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Role } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // ... você já tem o bootstrap-admin acima

  @Post('login')
  async login(
    // aceitamos x-tenant-subdomain (preferido) e x-tenant-slug (fallback)
    @Headers('x-tenant-subdomain') subdomain: string | undefined,
    @Headers('x-tenant-slug') slug: string | undefined,
    @Headers('x-tenant-code') code: string | undefined,
    @Body() body: LoginDto,
  ) {
    const tenantHint = (subdomain || slug || code || '').trim().toLowerCase();
    if (!tenantHint) {
      throw new BadRequestException(
        'Cabeçalho de tenant ausente. Envie x-tenant-subdomain ou x-tenant-slug.',
      );
    }

    // 1) Resolve o tenant
    const corretor =
      (await this.prisma.corretor.findFirst({
        where: {
          OR: [
            { subdomain: tenantHint },
            { slug: tenantHint },
            { tenantCode: tenantHint },
          ],
        },
        select: { id: true, isActive: true },
      })) || null;

    if (!corretor) {
      throw new BadRequestException('Tenant inválido.');
    }
    if (!corretor.isActive) {
      throw new UnauthorizedException('Tenant inativo.');
    }

    // 2) Busca usuário por e-mail + tenant
    const email = body.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { corretorId: corretor.id, email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        passwordHash: true, // **IMPORTANTE** para evitar 500 no bcrypt
        corretorId: true,
      },
    });

    if (!user) {
      // não revelar o que falhou
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Usuário inativo.');
    }
    if (!user.passwordHash) {
      // proteção contra 500: conta criada sem senha
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    // 3) Valida senha
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    // 4) Emite tokens e persiste hash do refresh (boa prática)
    const tokens = await this.authService.issueTokens({
      userId: user.id,
      corretorId: user.corretorId,
      role: user.role as Role,
      email: user.email,
    });

    try {
      const refreshHash = await bcrypt.hash(tokens.refreshToken, 10);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: refreshHash },
      });
    } catch {
      // não quebrar o login se a persistência do refresh falhar
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        corretorId: user.corretorId,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }
}
