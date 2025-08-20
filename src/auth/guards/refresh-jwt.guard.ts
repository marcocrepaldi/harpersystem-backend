import { Injectable, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class RefreshJwtGuard extends AuthGuard('jwt-refresh') {
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info?: any,
    _context?: ExecutionContext,
    _status?: any,
  ): TUser {
    if (err || !user) {
      const name = info?.name ?? err?.name;
      const rawMsg = typeof info === 'string' ? info : info?.message ?? err?.message;

      let message = 'Refresh token inválido ou ausente.';
      if (name === 'TokenExpiredError') message = 'Refresh token expirado.';
      else if (name === 'JsonWebTokenError') message = 'Refresh token inválido.';
      else if (rawMsg && /no auth token/i.test(rawMsg)) message = 'Cabeçalho Authorization ausente ou malformado.';

      throw new UnauthorizedException(message);
    }
    return user as TUser;
  }
}
