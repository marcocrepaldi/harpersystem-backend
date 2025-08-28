import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientPlansController } from './client-plans.controller';
import { ClientPlansService } from './client-plans.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClientPlansController],
  providers: [ClientPlansService],
  exports: [ClientPlansService],
})
export class ClientPlansModule {}
