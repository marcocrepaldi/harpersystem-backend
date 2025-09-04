import { Module } from '@nestjs/common';
import { InsurersController } from './insurers.controller';
import { InsurersService } from './insurers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Module({
  controllers: [InsurersController],
  providers: [InsurersService, PrismaService, AuditService],
  exports: [InsurersService],
})
export class InsurersModule {}
