import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Base comum aos dois tipos de token (access/refresh). */
export interface JwtPayloadBase {
  sub: string;        // userId
  email: string;
  role: string;
  corretorId: string;

  // campos padrão de JWT, opcionais
  iat?: number;
  exp?: number;

  // tipo do token: ausente/undefined em access; 'refresh' em refresh
  typ?: 'refresh' | undefined;

  // ergonomia: muitos serviços leem userId; mantemos como alias de sub
  userId?: string;
}

/** Payload esperado em rotas protegidas por access token (guard 'jwt'). */
export type JwtAccessPayload = JwtPayloadBase & { typ?: undefined };

/** Payload do refresh token (se você criar uma strategy específica p/ refresh). */
export type JwtRefreshPayload = JwtPayloadBase & { typ: 'refresh' };

/**
 * Retorna o usuário atual do request (payload do JWT),
 * definido pela Strategy e injetado pelo Guard.
 *
 * Em guards de acesso (strategy 'jwt'), a strategy já bloqueia tokens com typ='refresh'.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtAccessPayload | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const p = request.user as Partial<JwtPayloadBase> | undefined;
    if (!p) return undefined;
    // garante ergonomia: sempre expor userId
    return { ...p, userId: p.userId ?? p.sub } as JwtAccessPayload;
  },
);
