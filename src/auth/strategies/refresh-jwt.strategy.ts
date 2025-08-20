import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtRefreshPayload } from '../decorators/current-user.decorator';

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private readonly config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET não configurado no .env');

    const extractors = [
      ExtractJwt.fromBodyField('refreshToken'),
      ExtractJwt.fromHeader('x-refresh-token'),
      (req: any) => req?.cookies?.refreshToken,
    ];

    super({
      jwtFromRequest: ExtractJwt.fromExtractors(extractors),
      ignoreExpiration: false,
      secretOrKey: secret,
      issuer: config.get<string>('JWT_ISSUER') || undefined,
      audience: config.get<string>('JWT_AUDIENCE') || undefined,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: any): Promise<JwtRefreshPayload> {
    if (payload?.typ !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }
    // ✅ NÃO retorne refreshToken aqui — ele é o próprio JWT bruto, não parte do payload
    return {
      ...payload,
      userId: payload.sub, // opcional (ergonomia)
      typ: 'refresh',
    } as JwtRefreshPayload;
  }
}
