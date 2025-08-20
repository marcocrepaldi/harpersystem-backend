// src/auth/guards/roles.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    // Se a rota não exige roles, permite.
    if (requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    // Verificação de consistência multi-tenant (opcional, mas recomendada)
    const tenant = req.tenant;
    if (tenant && user.corretorId && user.corretorId !== tenant.id) {
      throw new ForbiddenException('Token não pertence ao tenant atual');
    }

    const role = String(user.role);

    // ADMIN passa em qualquer role
    if (role === 'ADMIN') return true;

    if (!requiredRoles.includes(role)) {
      throw new ForbiddenException('Acesso negado');
    }

    return true;
  }
}
