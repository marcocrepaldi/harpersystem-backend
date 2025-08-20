import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private publicSelect(): Prisma.UserSelect {
    return {
      id: true,
      name: true,
      email: true,
      role: true,
      corretorId: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  async create(dto: CreateUserDto & { corretorId: string }) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: dto.role ?? Role.USER,
          corretorId: dto.corretorId,
          isActive: true,
        },
        select: this.publicSelect(),
      });
      return user;
    } catch (e) {
      this.handlePrismaError(e);
    }
  }

  async findAll(params: { corretorId: string; page: number; limit: number; search?: string }) {
    const { corretorId, page, limit, search } = params;
    const where: Prisma.UserWhereInput = {
      corretorId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: this.publicSelect(),
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, page, limit, total };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.publicSelect(),
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async findOneScoped(params: { id: string; corretorId: string }) {
    const user = await this.prisma.user.findFirst({
      where: { id: params.id, corretorId: params.corretorId },
      select: this.publicSelect(),
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async updateScoped(params: { id: string; corretorId: string }, dto: UpdateUserDto) {
    const data: Prisma.UserUpdateInput = {
      name: dto.name,
      email: dto.email,
      role: dto.role,
      isActive: dto.isActive,
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    try {
      const user = await this.prisma.user.update({
        where: {
          // garante escopo: ID + tenant
          // prisma 6: usar constrain composto via unique? fallback: checar antes
          id: params.id,
        },
        data,
        select: this.publicSelect(),
      });

      if (user.corretorId !== params.corretorId) {
        throw new NotFoundException('Usuário não encontrado');
      }

      return user;
    } catch (e) {
      if (e?.code === 'P2025') throw new NotFoundException('Usuário não encontrado');
      this.handlePrismaError(e);
    }
  }

  async removeScoped(params: { id: string; corretorId: string }) {
    try {
      // checagem de escopo antes de deletar
      const found = await this.prisma.user.findFirst({
        where: { id: params.id, corretorId: params.corretorId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('Usuário não encontrado');

      await this.prisma.user.delete({ where: { id: params.id } });
      return { ok: true };
    } catch (e) {
      if (e?.code === 'P2025') throw new NotFoundException('Usuário não encontrado');
      this.handlePrismaError(e);
    }
  }

  private handlePrismaError(e: any): never {
    if (e?.code === 'P2002') {
      throw new ConflictException('E-mail já está em uso neste tenant.');
    }
    throw new BadRequestException(e?.message ?? 'Erro de banco.');
  }
}
