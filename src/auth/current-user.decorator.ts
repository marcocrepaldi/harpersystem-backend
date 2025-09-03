import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  userId: string;
  name?: string;
  email: string;
  role: 'ADMIN' | 'USER';
  corretorId: string;
}

/**
 * Decorator para recuperar os dados do usuário autenticado.
 *
 * Uso:
 *   @CurrentUser() user: CurrentUserPayload
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): CurrentUserPayload | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as CurrentUserPayload ?? null;
  },
);
