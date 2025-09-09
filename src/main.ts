// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
// import helmet from 'helmet'; // recomendado em produção
import { json, urlencoded } from 'express';
import compression from 'compression';
import { RedactExceptionFilter } from './common/filters/redact-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  // Porta
  const port = Number(process.env.PORT ?? 3001);

  // Prefixo global (sanitizado: sem barra inicial)
  const rawPrefix = String(process.env.API_PREFIX ?? 'api');
  const prefix = rawPrefix.replace(/^\/+/, '') || 'api';
  app.setGlobalPrefix(prefix);

  // Body limit (base64 costuma ser grande)
  const bodyLimit = process.env.BODY_LIMIT ?? '50mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ limit: bodyLimit, extended: true }));

  // Compressão
  app.use(compression());

  // trust proxy (se estiver atrás de proxy/ingress)
  if ((process.env.TRUST_PROXY ?? '').toLowerCase() === 'true') {
    // @ts-expect-error: prop de express não tipada no Nest
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
      if (!origin) return cb(null, true); // curl/postman
      if (allowlist.includes('*')) return cb(null, true);

      if (!isProd) {
        const ok =
          /^https?:\/\/([a-z0-9-]+\.)?localhost(?::\d+)?$/i.test(origin) ||
          /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin);
        return cb(ok ? null : new Error(`CORS dev: origem não permitida: ${origin}`), ok);
      }

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
    // ⬇️ Inclui X-Requested-With para destravar o preflight do login
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-subdomain',
      'x-tenant-slug',
      'x-tenant-code',
      'X-Requested-With',   // <- aqui
      'x-requested-with',   // (case-insensitive por garantia)
    ],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  });

  // Segurança HTTP (recomendada em produção)
  // if (isProd) {
  //   app.use(helmet({ contentSecurityPolicy: false }));
  // }

  // Validação global (sem refletir payload gigante em erros)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      // evita refletir payload (value/target) — não manda base64 nos erros de DTO
      validationError: { target: false, value: false },
    }),
  );

  // Filtro global para sanitizar respostas de erro (remove base64/strings enormes)
  app.useGlobalFilters(new RedactExceptionFilter());

  // ---------- Swagger (opcional; ligado por padrão em dev) ----------
  const enableSwagger =
    (process.env.ENABLE_SWAGGER ?? (isProd ? 'false' : 'true')).toLowerCase() === 'true';

  if (enableSwagger) {
    const cfg = new DocumentBuilder()
      .setTitle(process.env.SWAGGER_TITLE ?? 'Harper API')
      .setDescription(
        process.env.SWAGGER_DESCRIPTION ?? 'Documentação da API (rotas usam prefixo global).',
      )
      .setVersion(process.env.SWAGGER_VERSION ?? '1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Informe o token no formato: Bearer <token>',
        },
        'bearer',
      )
      .addServer(`/${prefix}`, 'Base com prefixo global')
      .build();

    const document = SwaggerModule.createDocument(app, cfg, { deepScanRoutes: true });

    const docsMount = String(process.env.SWAGGER_PATH ?? 'docs').replace(/^\/+/, '');
    SwaggerModule.setup(docsMount, app, document, {
      useGlobalPrefix: true, // UI em /{prefix}/{docsMount}
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        docExpansion: 'list',
      },
      customSiteTitle: process.env.SWAGGER_SITE_TITLE ?? 'Harper API Docs',
    });

    logger.log(`Swagger docs:  http://localhost:${port}/${prefix}/${docsMount}`);
    logger.log(`Swagger JSON:  http://localhost:${port}/${prefix}/${docsMount}-json`);
  }

  // Encerramento gracioso
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  logger.log(`API running on http://localhost:${port}/${prefix}`);
  if (allowlist.length) logger.log(`CORS allowlist: ${allowlist.join(', ')}`);
  logger.log(`Body limit: ${bodyLimit}`);
}

bootstrap();
