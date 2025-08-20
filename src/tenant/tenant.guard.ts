import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from "@nestjs/common";
import { TenantService } from "./tenant.service";

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenants: TenantService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    try {
      await this.tenants.getTenantFromRequest(req);
      return true;
    } catch (e) {
      throw new ForbiddenException((e as any)?.message || "Tenant inválido.");
    }
  }
}
