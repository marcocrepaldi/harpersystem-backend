import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  app() {
    const now = new Date();
    return {
      ok: true,
      service: 'api',
      status: 'up',
      env: process.env.NODE_ENV ?? 'development',
      version: process.env.npm_package_version ?? '0.0.0',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: now.toISOString(),
    };
  }

  @Get('db')
  async db() {
    const started = Date.now();
    try {
      // teste simples de conexão no Postgres
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - started;

      const totalCorretores = await this.prisma.corretor.count();

      return {
        ok: true,
        database: 'connected',
        latencyMs,
        totalCorretores,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      return {
        ok: false,
        database: 'unavailable',
        latencyMs,
        error: 'database_connection_failed',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
