import * as fs from 'fs';
import * as path from 'path';
import { randomUUID, createHash } from 'crypto';

export type ParsedBase64 = {
  mimeType: string;
  buffer: Buffer;
  extension: string;
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/zip': 'zip',
};

export function parseBase64DataUrl(dataUrl: string): ParsedBase64 {
  // aceita "data:<mime>;base64,<data>" ou apenas o base64 cru
  const match = /^data:(?<mime>[^;]+);base64,(?<data>.+)$/i.exec(dataUrl);
  let mime = 'application/octet-stream';
  let b64 = dataUrl;

  if (match?.groups?.mime && match?.groups?.data) {
    mime = match.groups.mime;
    b64 = match.groups.data;
  }

  const buffer = Buffer.from(b64, 'base64');
  const extension = MIME_TO_EXT[mime] ?? 'bin';
  return { mimeType: mime, buffer, extension };
}

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function safeFilename(name: string): string {
  // remove diretórios, caracteres estranhos etc.
  const base = path.basename(name).replace(/[^\w.\- ()\[\]]+/g, '_');
  return base || `file-${randomUUID()}`;
}
