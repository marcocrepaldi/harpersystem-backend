// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
// import helmet from 'helmet'; // opcional em produção

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  // Porta
  const port = Number(process.env.PORT ?? 3001);

  // Prefixo global (sanitizado: sem barra inicial)
  // Use API_PREFIX=api (sem "/"). Se vier com "/", a gente remove.
  const rawPrefix = String(process.env.API_PREFIX ?? 'api');
  const prefix = rawPrefix.replace(/^\/+/, '') || 'api';
  app.setGlobalPrefix(prefix);

  // CORS
  const isProd = process.env.NODE_ENV === 'production';
  const allowlist = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, cb) => {
      // curl/postman (sem Origin) => permitir
      if (!origin) return cb(null, true);

      if (!isProd) {
        // Dev: permitir localhost, 127.0.0.1 e subdomínios *.localhost
        const ok =
          /^https?:\/\/([a-z0-9-]+\.)?localhost(?::\d+)?$/i.test(origin) ||
          /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin);
        return cb(ok ? null : new Error('CORS: origem não permitida (dev)'), ok);
      }

      // Produção: restringe à allowlist
      const ok = allowlist.includes(origin);
      return cb(ok ? null : new Error('CORS: origem não permitida'), ok);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-subdomain', // ⬅️ ADICIONE ESTE
      'x-tenant-slug',
      'x-tenant-code',
    ],
    exposedHeaders: ['Content-Disposition'],
  });

  // Segurança HTTP (recomendada em produção)
  // if (isProd) {
  //   app.use(helmet({ contentSecurityPolicy: false }));
  // }

  // Validação global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.listen(port, '0.0.0.0');

  logger.log(`API running on http://localhost:${port}/${prefix}`);
  if (allowlist.length) logger.log(`CORS allowlist: ${allowlist.join(', ')}`);
}

bootstrap();
