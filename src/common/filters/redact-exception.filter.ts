import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

function sanitizeString(s: string): string {
  // remove data URL/base64 gigante
  s = s.replace(/data:[\w.+-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g, '[base64]');
  // trunca string absurda
  const MAX = 1000;
  if (s.length > MAX) s = s.slice(0, MAX) + '…';
  return s;
}

function redactDeep(obj: any, seen = new WeakSet()): any {
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitizeString(obj) : obj;
  }
  if (seen.has(obj)) return '[circular]';
  seen.add(obj);

  if (Array.isArray(obj)) return obj.map((v) => redactDeep(v, seen));

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/base64|file|data|payload/i.test(k)) {
      out[k] = '[redacted]';
    } else {
      out[k] = redactDeep(v, seen);
    }
  }
  return out;
}

@Catch()
export class RedactExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const safe =
        typeof body === 'object' ? redactDeep(body) : sanitizeString(String(body ?? ''));
      return res.status(status).json(safe);
    }

    return res.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
      error: sanitizeString(String(exception?.message || exception || '')),
    });
  }
}
