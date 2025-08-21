import { Module, forwardRef } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantsModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    TenantsModule,
    // Em caso de dependência circular entre Auth <-> Clients, use forwardRef
    forwardRef(() => AuthModule),
    AuditModule, // fornece AuditService
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
