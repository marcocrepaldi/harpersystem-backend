import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  controllers: [ReconciliationController],
  providers: [ReconciliationService, PrismaService],
})
export class ReconciliationModule {}
