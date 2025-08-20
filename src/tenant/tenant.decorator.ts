import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { TenantInfo } from "./tenant.types";

export const Tenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): TenantInfo | undefined => {
  const req = ctx.switchToHttp().getRequest();
  return req.tenant as TenantInfo | undefined;
});
