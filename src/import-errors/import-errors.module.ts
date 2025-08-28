import { Module } from '@nestjs/common';
import { ImportErrorsController } from './import-errors.controller';
import { ImportErrorsService } from './import-errors.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [ImportErrorsController],
  providers: [ImportErrorsService, PrismaService],
  exports: [ImportErrorsService],
})
export class ImportErrorsModule {}
