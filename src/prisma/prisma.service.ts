import {
  Injectable,
  INestApplication,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Habilita logs em desenvolvimento
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['query', 'error', 'warn']
          : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Fecha a conexão do Prisma quando a aplicação for encerrada
   */
  async enableShutdownHooks(app: INestApplication) {
    // Força o TypeScript a aceitar o evento beforeExit
    (this as any).$on('beforeExit', async () => {
      await app.close();
    });
  }
}
