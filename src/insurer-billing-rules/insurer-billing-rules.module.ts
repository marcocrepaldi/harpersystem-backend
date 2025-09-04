// src/insurer-billing-rules/insurer-billing-rules.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InsurerBillingRulesController } from './insurer-billing-rules.controller';
import { InsurerBillingRulesService } from './insurer-billing-rules.service';

@Module({
  controllers: [InsurerBillingRulesController],
  providers: [InsurerBillingRulesService, PrismaService, AuditService],
  exports: [InsurerBillingRulesService],
})
export class InsurerBillingRulesModule {}
