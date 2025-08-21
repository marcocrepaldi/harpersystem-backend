import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(active?: boolean) {
    return this.prisma.service.findMany({
      where: typeof active === 'boolean' ? { isActive: active } : undefined,
      orderBy: [{ name: 'asc' }],
    });
  }
}
