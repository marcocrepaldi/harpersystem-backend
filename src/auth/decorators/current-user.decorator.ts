// src/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Base comum aos payloads de access e refresh.
 */
export type JwtBasePayload = {
  sub: string; // user id (subject)
  userId?: string; // ergonomia (algumas strategies copiam sub -> userId)
  email: string;
  role: 'ADMIN' | 'USER';
  corretorId: string;
  iat?: number;
  exp?: number;
  typ?: 'access' | 'refresh';
};

/**
 * Payload esperado em rotas protegidas por access token.
 * No seu JwtStrategy você já bloqueia quando typ === 'refresh'.
 */
export type JwtAccessPayload = Omit<JwtBasePayload, 'typ'> & {
  typ?: 'access';
};

/**
 * Payload para rotas que validam especificamente refresh token.
 * Inclui opcionalmente um identificador do RT (se você emitir).
 */
export type JwtRefreshPayload = Omit<JwtBasePayload, 'typ'> & {
  typ: 'refresh';
  tokenId?: string;
};

/** União útil quando precisar aceitar qualquer um. */
export type JwtPayload = JwtAccessPayload | JwtRefreshPayload;

/** Alias comum usado em controllers (seus arquivos citavam `UserJwt`). */
export type UserJwt = JwtAccessPayload;

/**
 * Decorator para extrair o usuário (access token) do request.
 * Uso: handler(@CurrentUser() user: UserJwt)
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtAccessPayload | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req?.user as JwtAccessPayload | undefined;
  },
);

/**
 * Decorator para rotas de refresh que usam strategy própria de RT.
 * Uso: handler(@CurrentRefreshUser() user: JwtRefreshPayload)
 */
export const CurrentRefreshUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtRefreshPayload | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req?.user as JwtRefreshPayload | undefined;
  },
);
