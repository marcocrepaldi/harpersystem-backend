// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
// import helmet from 'helmet'; // recomendado em produção
import { json, urlencoded } from 'express';
import compression from 'compression';

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

  // Body limit (base64 costuma ser grande)
  const bodyLimit = process.env.BODY_LIMIT ?? '50mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ limit: bodyLimit, extended: true }));

  // Compressão (ajuda no tráfego de JSON grande)
  app.use(compression());

  // trust proxy (se estiver atrás de proxy/ingress)
  if (process.env.TRUST_PROXY?.toLowerCase() === 'true') {
    // @ts-ignore - propriedade do Express
    app.set('trust proxy', 1);
  }

  // CORS
  const isProd = process.env.NODE_ENV === 'production';
  const allowlist = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, cb) => {
      // Sem Origin (curl/postman) => permitir
      if (!origin) return cb(null, true);

      // Curinga explícito
      if (allowlist.includes('*')) return cb(null, true);

      if (!isProd) {
        // Dev: permitir localhost, 127.0.0.1 e subdomínios *.localhost
        const ok =
          /^https?:\/\/([a-z0-9-]+\.)?localhost(?::\d+)?$/i.test(origin) ||
          /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin);
        return cb(ok ? null : new Error(`CORS dev: origem não permitida: ${origin}`), ok);
      }

      // Produção: restringe à allowlist (aceita também padrões regex iniciados por ^)
      const ok = allowlist.some((o) => {
        if (o.startsWith('^')) {
          try {
            return new RegExp(o).test(origin);
          } catch {
            return false;
          }
        }
        return o === origin;
      });
      return cb(ok ? null : new Error(`CORS: origem não permitida: ${origin}`), ok);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-subdomain',
      'x-tenant-slug',
      'x-tenant-code',
    ],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600, // cache do preflight
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

  // Encerramento gracioso
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  logger.log(`API running on http://localhost:${port}/${prefix}`);
  if (allowlist.length) logger.log(`CORS allowlist: ${allowlist.join(', ')}`);
  logger.log(`Body limit: ${bodyLimit}`);
}

bootstrap();
