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

  private parseBase64(b64: string): Buffer {
    const pure = b64.includes(',') ? b64.split(',').pop()! : b64;
    if (!pure || !/^[A-Za-z0-9+/=\r\n]+$/.test(pure)) {
      throw new BadRequestException('base64 inválido.');
    }
    return Buffer.from(pure, 'base64');
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

    const buf = this.parseBase64(dto.base64);
    const sha = this.sha256(buf);

    const uuid = randomUUID();
    const ext = path.extname(dto.filename || '') || '';
    const dir = path.join(this.baseUploadDir(), 'tenants', corretorId, 'clients', clientId);
    this.ensureDirSync(dir);
    const full = path.join(dir, `${uuid}${ext}`);

    await fsp.writeFile(full, buf);

    const created = await this.prisma.document.create({
      data: {
        corretorId,
        clientId,
        policyId: dto.policyId ?? null,
        filename: dto.filename,
        mimeType: dto.mimeType,
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
