// src/policies/policies.module.ts
import { Module } from "@nestjs/common";
import { PoliciesController } from "./policies.controller";
import { PoliciesService } from "./policies.service";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [PoliciesController],
  providers: [PoliciesService],
})
export class PoliciesModule {}
