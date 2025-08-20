import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCorretorDto } from "./dto/create-corretor.dto";

@Injectable()
export class CorretoresService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.corretor.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        cpfCnpj: true,
        email: true,
        phone: true,
        subdomain: true,
        slug: true,
        tenantCode: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findById(id: string) {
    const item = await this.prisma.corretor.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("Corretor não encontrado");
    return item;
  }

  async findBySlug(slug: string) {
    const item = await this.prisma.corretor.findUnique({ where: { slug } });
    if (!item) throw new NotFoundException("Corretor não encontrado");
    return item;
  }

  async create(dto: CreateCorretorDto) {
    try {
      return await this.prisma.corretor.create({
        data: {
          name: dto.name,
          cpfCnpj: dto.cpfCnpj, // já vem sanitizado pelo DTO
          email: dto.email.toLowerCase().trim(),
          phone: dto.phone ?? null,
          subdomain: dto.subdomain,
          slug: dto.slug,
          tenantCode: dto.tenantCode ?? null,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = Array.isArray(e.meta?.target) ? (e.meta!.target as string[]).join(", ") : "constraint";
        throw new ConflictException(`Valor já existe para: ${target}`);
      }
      throw e;
    }
  }
}
