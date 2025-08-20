import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { TenantService } from "./tenant.service";

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantsModule {}
