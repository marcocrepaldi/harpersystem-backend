import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtAccessPayload } from '@/auth/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET não configurado no .env');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer: config.get<string>('JWT_ISSUER') || undefined,
      audience: config.get<string>('JWT_AUDIENCE') || undefined,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: any): Promise<JwtAccessPayload> {
    // Bloqueia uso de refresh token em rotas de access
    if (payload?.typ === 'refresh') {
      throw new UnauthorizedException('Invalid token type for this route');
    }

    // Normaliza o shape do req.user para o projeto
    const user: JwtAccessPayload = {
      sub: payload.sub,
      userId: payload.sub, // ergonomia
      email: payload.email,
      role: payload.role,
      corretorId: payload.corretorId,
      iat: payload.iat,
      exp: payload.exp,
      typ: 'access',
    };

    // (opcional) sanity-check
    if (!user.corretorId) {
      // Isso não deveria acontecer se o token foi emitido pelo seu AuthService
      throw new UnauthorizedException('Token sem corretorId.');
    }

    return user;
  }
}
