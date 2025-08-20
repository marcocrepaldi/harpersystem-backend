import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAccessPayload } from '../decorators/current-user.decorator';

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
    // Bloqueia uso de RT em rotas de acesso
    if (payload?.typ === 'refresh') {
      throw new UnauthorizedException('Invalid token type for this route');
    }
    // Ergonomia: garantir userId
    return { ...payload, userId: payload.sub } as JwtAccessPayload;
  }
}
// ✅ exportação nomeada já está correta
