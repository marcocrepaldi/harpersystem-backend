import "express";
import { TenantInfo } from "../tenant/tenant.types";

declare module "express-serve-static-core" {
  interface Request {
    tenant?: TenantInfo;
  }
}
