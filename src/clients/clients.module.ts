import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantsModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from '../audit/audit.service';

@Module({
  imports: [PrismaModule, TenantsModule, AuthModule],
  controllers: [ClientsController],
  providers: [ClientsService, AuditService],
})
export class ClientsModule {}
