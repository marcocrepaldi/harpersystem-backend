import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule], // garante que o PrismaService esteja disponível
  controllers: [HealthController],
})
export class HealthModule {}
