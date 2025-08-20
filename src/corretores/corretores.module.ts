import { Module } from "@nestjs/common";
import { CorretoresController } from "./corretores.controller";
import { CorretoresService } from "./corretores.service";
import { PrismaModule } from "../prisma/prisma.module"; // <- se existir

@Module({
  imports: [PrismaModule],                // <- usa o PrismaService exportado
  controllers: [CorretoresController],
  providers: [CorretoresService],         // <- remove PrismaService aqui
  exports: [CorretoresService],
})
export class CorretoresModule {}
