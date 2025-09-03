import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { CreateDocumentDto, DocumentCategoryDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadBase64Dto } from './dto/upload-base64.dto';

// converte enum DTO -> enum Prisma (string idêntica)
const mapCategory = (c?: DocumentCategoryDto): any => c ?? 'ANEXO';

// limites
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || '52428800', 10); // 50MB default
const BASE64_RE = /^[A-Za-z0-9+/=\r\n]+$/;
const DATAURL_PREFIX_RE = /^data:([\w.+-]+\/[\w.+-]+);base64,/i;

// mapa simples mime->ext de fallback
const MIME_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/octet-stream': '',
};

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pasta base para uploads locais */
  private baseUploadDir() {
    return path.join(process.cwd(), 'uploads');
  }

  private ensureDirSync(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  /** Extrai mime a partir de um dataURL, se houver */
  private mimeFromBase64(data: string): string | null {
    const m = data.match(DATAURL_PREFIX_RE);
    return m ? m[1].toLowerCase() : null;
  }

  /** Normaliza e valida o base64; aplica limite de tamanho */
  private parseBase64(b64: string): Buffer {
    const pure = b64.includes(',') ? b64.split(',').pop()! : b64;
    if (!pure || !BASE64_RE.test(pure)) {
      throw new BadRequestException('base64 inválido.');
    }
    // tamanho aproximado pré-decodificação para proteger antes de alocar
    // (cada 4 chars base64 ~ 3 bytes)
    const approxBytes = Math.floor((pure.replace(/\s+/g, '').length * 3) / 4);
    if (approxBytes > MAX_UPLOAD_BYTES * 1.1) {
      // pequena folga por conta de padding
      const mb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
      throw new BadRequestException(`Arquivo excede o tamanho máximo de ${mb}MB.`);
    }

    const buf = Buffer.from(pure, 'base64');
    if (buf.byteLength > MAX_UPLOAD_BYTES) {
      const mb = (MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0);
      throw new BadRequestException(`Arquivo excede o tamanho máximo de ${mb}MB.`);
    }
    return buf;
  }

  private sha256(buf: Buffer) {
    return createHash('sha256').update(buf).digest('hex');
  }

  private storageKeyLocal(fullPath: string) {
    const rel = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
    return `file://${rel}`;
  }

  private diskPathFromStorageKey(storageKey: string): string {
    if (storageKey.startsWith('file://')) {
      const rel = storageKey.replace('file://', '');
      return path.join(process.cwd(), rel);
    }
    return path.isAbsolute(storageKey) ? storageKey : path.join(process.cwd(), storageKey);
  }

  /** Deriva uma extensão segura a partir do filename e/ou mime */
  private safeExt(filename: string, mime?: string | null): string {
    const fromName = path.extname(filename || '').toLowerCase();
    if (fromName && fromName.length <= 6) return fromName; // ex: .pdf .jpeg

    const fromMime = (mime && MIME_EXT[mime.toLowerCase()]) || '';
    return fromMime || '';
  }

  async create(
    corretorId: string,
    clientId: string,
    dto: CreateDocumentDto,
    createdBy?: string,
  ) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, corretorId } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    if (!dto.storageKey) throw new BadRequestException('storageKey é obrigatório (não-base64).');

    const created = await this.prisma.document.create({
      data: {
        corretorId,
        clientId,
        policyId: dto.policyId ?? null,
        filename: dto.filename,
        mimeType: dto.mimeType,
        size: dto.size,
        category: mapCategory(dto.category),
        tags: dto.tags ?? [],
        notes: dto.notes,
        storageKey: dto.storageKey,
        checksum: dto.checksum ?? null,
        createdBy: createdBy ?? null,
      },
    });

    return created;
  }

  async uploadBase64(
    corretorId: string,
    clientId: string,
    dto: UploadBase64Dto,
    createdBy?: string,
  ) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, corretorId } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');

    // decodifica e valida tamanho
    const buf = this.parseBase64(dto.base64);
    const sha = this.sha256(buf);

    // tenta inferir mime do dataURL caso venha diferente
    const mimeFromData = this.mimeFromBase64(dto.base64);
    const mime = (mimeFromData || dto.mimeType || 'application/octet-stream').toLowerCase();

    const uuid = randomUUID();
    const ext = this.safeExt(dto.filename || '', mime);
    const finalFilename = dto.filename || `${uuid}${ext || ''}`;

    const dir = path.join(this.baseUploadDir(), 'tenants', corretorId, 'clients', clientId);
    this.ensureDirSync(dir);
    const full = path.join(dir, `${uuid}${ext}`);

    await fsp.writeFile(full, buf);

    const created = await this.prisma.document.create({
      data: {
        corretorId,
        clientId,
        policyId: dto.policyId ?? null,
        filename: finalFilename,
        mimeType: mime,
        size: buf.byteLength,
        category: mapCategory(dto.category),
        tags: dto.tags ?? [],
        notes: dto.notes,
        storageKey: this.storageKeyLocal(full),
        checksum: dto.checksum ?? sha,
        createdBy: createdBy ?? null,
      },
    });

    return created;
  }

  async list(
    corretorId: string,
    clientId: string,
    opts: { q?: string; category?: string; policyId?: string; page?: number; limit?: number } = {},
  ) {
    const { q, category, policyId } = opts;
    const page = Math.max(1, Number(opts.page || 1));
    const take = Math.min(100, Math.max(1, Number(opts.limit || 20)));
    const skip = (page - 1) * take;

    const where: any = {
      corretorId,
      clientId,
      deletedAt: null,
    };
    if (q) {
      where.OR = [
        { filename: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { tags: { has: q } },
      ];
    }
    if (category) where.category = category;
    if (policyId) where.policyId = policyId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items, total, page, pageCount: Math.ceil(total / take) };
  }

  async get(corretorId: string, clientId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, corretorId, clientId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');
    return doc;
  }

  async update(corretorId: string, clientId: string, id: string, dto: UpdateDocumentDto) {
    await this.get(corretorId, clientId, id);
    return this.prisma.document.update({
      where: { id },
      data: {
        filename: dto.filename ?? undefined,
        category: dto.category ? mapCategory(dto.category) : undefined,
        tags: Array.isArray(dto.tags) ? dto.tags : undefined,
        notes: dto.notes ?? undefined,
      },
    });
  }

  async softDelete(corretorId: string, clientId: string, id: string, _deletedBy?: string) {
    await this.get(corretorId, clientId, id);
    return this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getFileStream(corretorId: string, clientId: string, id: string) {
    const doc = await this.get(corretorId, clientId, id);
    const diskPath = this.diskPathFromStorageKey(doc.storageKey);
    if (!fs.existsSync(diskPath)) throw new NotFoundException('Arquivo não encontrado no disco.');
    const stream = fs.createReadStream(diskPath);
    return { doc, stream, diskPath };
  }
}
