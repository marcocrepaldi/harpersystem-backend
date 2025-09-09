import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { CorretoresModule } from './corretores/corretores.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { RolesGuard } from './auth/guards/roles.guard';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ClientsModule } from './clients/clients.module';
import { PoliciesModule } from './policies/policies.module';
import { ServicesModule } from './services/services.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { HealthPlanModule } from './healthplan/plans.module';
import { ClientPlansModule } from './healthplan/client-plans.module';
import { ImportErrorsModule } from './import-errors/import-errors.module';
import { DocumentsModule } from './documents/documents.module';
import { InsurersModule } from './insurers/insurers.module';
import { InsurerBillingRulesModule } from './insurer-billing-rules/insurer-billing-rules.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    PrismaModule,
    HealthModule,
    CorretoresModule,
    UsersModule,
    AuthModule,
    ClientsModule,
    PoliciesModule,
    ServicesModule,
    BeneficiariesModule,
    InvoicesModule,
    ReconciliationModule,
    HealthPlanModule,
    ClientPlansModule,
    ImportErrorsModule,
    DocumentsModule,
    InsurersModule,
    InsurerBillingRulesModule,
    ImportErrorsModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RolesGuard,
    JwtAuthGuard,
  ],
})
export class AppModule {}
