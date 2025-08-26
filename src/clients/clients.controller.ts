import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { FindClientsQueryDto } from './dto/find-clients.dto';
import { PrismaService } from '../prisma/prisma.service';

type RequestUser = {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  corretorId: string;
};

type IncludeKey = 'addresses' | 'contacts' | 'services' | 'tags';

/**
 * Aceita:
 *  - "true" | "all" | "*"  -> true (traz todas as relações)
 *  - "addresses,contacts"  -> lista específica
 *  - "false" | vazio       -> false (sem relações)
 *  - undefined              -> DEFAULT = true (ótimo para tela de edição)
 */
function parseIncludeRels(value?: string): boolean | IncludeKey[] | false | undefined {
  if (value === undefined) return undefined;
  const v = (value || '').trim().toLowerCase();
  if (v === 'true' || v === 'all' || v === '*') return true;
  if (v === 'false' || v === '') return false;
  const parts = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as IncludeKey[];
  return parts.length ? parts : false;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly service: ClientsService,
    private readonly prisma: PrismaService, // <- adicionado
  ) {}

  @Get()
  findMany(@Query() query: FindClientsQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.findForTenant(user.corretorId, query);
  }

  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.create(user.corretorId, user.id, dto, req);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Query('includeRels') includeRelsParam?: string,
  ) {
    const parsed = parseIncludeRels(includeRelsParam);
    const includeRels = parsed === undefined ? true : parsed; // default=TRUE (pré-preencher edição)
    return this.service.getByIdForTenant(id, user.corretorId, includeRels);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, user.corretorId, user.id, dto, req);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.softDelete(id, user.corretorId, user.id, req);
  }

  @Post(':id/restore')
  restore(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.restore(id, user.corretorId, user.id, req);
  }

  // ----- Addresses -----
  @Get(':clientId/addresses/:addressId')
  getAddress(
    @Param('clientId') clientId: string,
    @Param('addressId') addressId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getAddressById(clientId, addressId, user.corretorId);
  }

  @Post(':clientId/addresses')
  createAddress(
    @Param('clientId') clientId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAddressDto,
    @Req() req: Request,
  ) {
    return this.service.createAddress(clientId, user.corretorId, user.id, dto, req);
  }

  @Patch(':clientId/addresses/:addressId')
  updateAddress(
    @Param('clientId') clientId: string,
    @Param('addressId') addressId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAddressDto,
    @Req() req: Request,
  ) {
    return this.service.updateAddress(clientId, addressId, user.corretorId, user.id, dto, req);
  }

  @Delete(':clientId/addresses/:addressId')
  deleteAddress(
    @Param('clientId') clientId: string,
    @Param('addressId') addressId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.deleteAddress(clientId, addressId, user.corretorId, user.id, req);
  }

  // ----- Contacts -----
  @Get(':clientId/contacts/:contactId')
  getContact(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getContactById(clientId, contactId, user.corretorId);
  }

  @Post(':clientId/contacts')
  createContact(
    @Param('clientId') clientId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateContactDto,
    @Req() req: Request,
  ) {
    return this.service.createContact(clientId, user.corretorId, user.id, dto, req);
  }

  @Patch(':clientId/contacts/:contactId')
  updateContact(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateContactDto,
    @Req() req: Request,
  ) {
    return this.service.updateContact(clientId, contactId, user.corretorId, user.id, dto, req);
  }

  @Delete(':clientId/contacts/:contactId')
  deleteContact(
    @Param('clientId') clientId: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.deleteContact(clientId, contactId, user.corretorId, user.id, req);
  }

  // =====================================================================
  // =====================  Invoices / Reconciliação  =====================
  // =====================================================================

  /**
   * PATCH /clients/:clientId/invoices/reconcile
   * Marca como CONCILIADO:
   *  - itens (health_imported_invoice_items.statusLinha)
   *  - cabeçalhos (health_imported_invoices.statusConciliacao), para fallback sem itens
   *
   * Body: { invoiceIds: string[] }
   * Retorno: { ok, updatedItems, updatedInvoices, count }
   */
  @Patch(':clientId/invoices/reconcile')
  async reconcileInvoices(
    @Param('clientId') clientId: string,
    @Body() body: { invoiceIds: string[] },
    @CurrentUser() user: RequestUser,
  ) {
    const ids = Array.isArray(body?.invoiceIds) ? body.invoiceIds.filter(Boolean) : [];
    if (ids.length === 0) {
      throw new BadRequestException('Informe ao menos um ID de fatura/linha para conciliar.');
    }

    // valida escopo do tenant
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, corretorId: user.corretorId },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado neste tenant.');
    }

    // Itens pertencentes ao cliente (JOIN via fatura)
    const items = await this.prisma.faturaItem.updateMany({
      data: { statusLinha: 'CONCILIADO', updatedAt: new Date() },
      where: {
        id: { in: ids },
        fatura: { clientId },
      },
    });

    // Cabeçalhos pertencentes ao cliente (caso de import sem itens)
    const headers = await this.prisma.faturaImportada.updateMany({
      data: { statusConciliacao: 'CONCILIADO', updatedAt: new Date() },
      where: {
        id: { in: ids },
        clientId,
      },
    });

    return {
      ok: true,
      updatedItems: items.count,
      updatedInvoices: headers.count,
      count: items.count + headers.count,
    };
  }

  /**
   * DELETE /clients/:clientId/invoices?mes=YYYY-MM
   * Remove a fatura importada do mês (cabeçalhos + itens em cascata).
   *
   * Retorno: { ok, count }
   */
  @Delete(':clientId/invoices')
  async deleteInvoicesByMonth(
    @Param('clientId') clientId: string,
    @Query('mes') mes: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      throw new BadRequestException('Parâmetro "mes" inválido. Use o formato YYYY-MM.');
    }

    // valida escopo do tenant
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, corretorId: user.corretorId },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException('Cliente não encontrado neste tenant.');
    }

    const year = Number(mes.slice(0, 4));
    const month = Number(mes.slice(5, 7));
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const nextMonth = new Date(Date.UTC(year, month, 1));

    const result = await this.prisma.faturaImportada.deleteMany({
      where: {
        clientId,
        mesReferencia: {
          gte: firstDay,
          lt: nextMonth,
        },
      },
    });

    return { ok: true, count: result.count };
  }
}
