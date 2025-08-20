// src/auth/guards/jwt-auth.guard.ts
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // err: Error | undefined
  // info: Error | string | undefined (passport-jwt preenche com erros conhecidos)
  handleRequest(err: any, user: any, info?: any) {
    if (err || !user) {
      const name = info?.name ?? err?.name;
      const rawMsg = typeof info === 'string' ? info : info?.message ?? err?.message;

      let message = 'Credenciais inválidas.';
      if (name === 'TokenExpiredError') message = 'Token expirado.';
      else if (name === 'JsonWebTokenError') message = 'Token inválido.';
      else if (rawMsg && /no auth token/i.test(rawMsg)) message = 'Cabeçalho Authorization ausente.';

      throw new UnauthorizedException(message);
    }
    return user;
  }
}
