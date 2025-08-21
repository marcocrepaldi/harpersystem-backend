// src/auth/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

/**
 * Metadado lido pelo JwtAuthGuard (via Reflector) para
 * liberar rotas sem exigir autenticação.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Use @Public() em handlers ou controllers:
 *
 * @Public()
 * @Get('health')
 * getHealth() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
