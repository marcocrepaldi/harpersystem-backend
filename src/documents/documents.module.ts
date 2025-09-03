import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PrismaService } from '@/prisma/prisma.service';
import { TenantResolver } from '@/common/tenant/tenant.resolver';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, PrismaService, TenantResolver],
})
export class DocumentsModule {}
