import { Module } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { BeneficiaryImportsService } from './imports.service';
import { BeneficiaryImportsController } from './imports.controller';

@Module({
  controllers: [BeneficiaryImportsController],
  providers: [PrismaService, BeneficiaryImportsService],
  exports: [BeneficiaryImportsService],
})
export class BeneficiaryImportsModule {}
