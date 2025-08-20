import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Prisma, ClientStatus, PersonType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toJsonInput } from '../common/prisma-json';
import { AuditService } from '../audit/audit.service';
import { CreateClientDto, ClientStatusDto, PersonTypeDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';
import { FindClientsQueryDto } from './dto/find-clients.dto';

type IncludeKey = 'addresses' | 'contacts';

function mapStatus(s?: ClientStatusDto): ClientStatus | undefined {
  if (!s) return undefined;
  switch (s) {
    case 'lead':
      return ClientStatus.LEAD;
    case 'prospect':
      return ClientStatus.PROSPECT;
    case 'active':
      return ClientStatus.ACTIVE;
    case 'inactive':
      return ClientStatus.INACTIVE;
    default:
      return undefined;
  }
}

function mapPersonType(p: PersonTypeDto): PersonType {
  return p === 'PJ' ? PersonType.PJ : PersonType.PF;
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- HELPERS ----------
  private async ensureClientOwnership(clientId: string, corretorId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, corretorId },
      select: { id: true },
    });
    if (!client) throw new ForbiddenException('Client does not belong to your tenant');
  }

  private buildInclude(includeRels: boolean | IncludeKey[] | undefined): Prisma.ClientInclude | undefined {
    if (includeRels === true) return { addresses: true, contacts: true };
    if (Array.isArray(includeRels)) {
      return {
        addresses: includeRels.includes('addresses'),
        contacts: includeRels.includes('contacts'),
      };
    }
    return undefined;
  }

  // ---------- LIST ----------
  async findForTenant(corretorId: string, query: FindClientsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {
      corretorId,
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { document: { contains: query.search } },
              { phone: { contains: query.search } },
            ],
          }
        : undefined),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          document: true,
          birthDate: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.client.count({ where }),
    ]);

    return { items, page, limit, total };
  }

  // ---------- READ ----------
  async getByIdForTenant(
    id: string,
    corretorId: string,
    includeRels: boolean | IncludeKey[] | undefined = false,
  ) {
    const client = await this.prisma.client.findFirst({
      where: { id, corretorId },
      include: this.buildInclude(includeRels),
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  // ---------- CREATE ----------
  async create(corretorId: string, actorId: string, dto: CreateClientDto, req?: Request) {
    const data: Prisma.ClientCreateInput = {
      corretor: { connect: { id: corretorId } },
      name: dto.name,
      email: dto.email ?? undefined,
      phone: dto.phone ?? undefined,
      document: dto.document ?? undefined,
      personType: mapPersonType(dto.personType),
      status: mapStatus(dto.status) ?? ClientStatus.ACTIVE,
      tags: dto.tags ?? [],
      preferences: toJsonInput(dto.preferences),
      marketingOptIn: dto.marketingOptIn ?? false,
      privacyConsent: toJsonInput(dto.privacyConsent),
      // Legados/normalizações de PF/PJ
      pfRg: dto.pf?.rg ?? undefined,
      birthDate: dto.pf?.birthDate ? new Date(dto.pf.birthDate) : undefined,
      pfMaritalStatus: dto.pf?.maritalStatus ?? undefined,
      pfProfession: dto.pf?.profession ?? undefined,
      pfIsPEP: dto.pf?.isPEP ?? undefined,
      pjCorporateName: dto.pj?.corporateName ?? undefined,
      pjTradeName: dto.pj?.tradeName ?? undefined,
      pjCnpj: dto.pj?.cnpj ?? undefined,
      pjStateRegistration: dto.pj?.stateRegistration ?? undefined,
      pjMunicipalRegistration: dto.pj?.municipalRegistration ?? undefined,
      pjCNAE: dto.pj?.cnae ?? undefined,
      pjFoundationDate: dto.pj?.foundationDate ? new Date(dto.pj.foundationDate) : undefined,
      pjRepName: dto.pj?.legalRepresentative?.name ?? undefined,
      pjRepCpf: dto.pj?.legalRepresentative?.cpf ?? undefined,
      pjRepEmail: dto.pj?.legalRepresentative?.email ?? undefined,
      pjRepPhone: dto.pj?.legalRepresentative?.phone ?? undefined,
      // Contato principal (legado)
      primaryContactName: dto.primaryContact?.name ?? undefined,
      primaryContactRole: dto.primaryContact?.role ?? undefined,
      primaryContactEmail: dto.primaryContact?.email ?? undefined,
      primaryContactPhone: dto.primaryContact?.phone ?? undefined,
      primaryContactNotes: dto.primaryContact?.notes ?? undefined,
      // Endereço legado (mínimo)
      addressZip: dto.address?.zip ?? undefined,
      addressStreet: dto.address?.street ?? undefined,
      addressNumber: dto.address?.number ?? undefined,
      addressComplement: dto.address?.complement ?? undefined,
      addressDistrict: dto.address?.district ?? undefined,
      addressCity: dto.address?.city ?? undefined,
      addressState: dto.address?.state ?? undefined,
      addressCountry: dto.address?.country ?? undefined,
    };

    const created = await this.prisma.client.create({ data });

    await this.audit.log({
      corretorId,
      entity: 'client',
      entityId: created.id,
      action: 'CREATE',
      before: null,
      after: created,
      actorId,
      req,
    });

    return created;
  }

  // ---------- UPDATE ----------
  async update(id: string, corretorId: string, actorId: string, dto: UpdateClientDto, req?: Request) {
    const existing = await this.prisma.client.findFirst({ where: { id, corretorId } });
    if (!existing) throw new NotFoundException('Client not found');

    if (dto.expectedUpdatedAt) {
      const expected = new Date(dto.expectedUpdatedAt).getTime();
      const current = new Date(existing.updatedAt).getTime();
      if (current !== expected) {
        throw new BadRequestException('Record has changed since your last read (concurrency check failed)');
      }
    }

    const data: Prisma.ClientUpdateInput = {
      name: dto.name ?? undefined,
      email: dto.email ?? undefined,
      phone: dto.phone ?? undefined,
      document: dto.document ?? undefined,
      personType: dto.personType ? mapPersonType(dto.personType) : undefined,
      status: mapStatus(dto.status),
      tags: dto.tags ? { set: dto.tags } : undefined,
      preferences: toJsonInput(dto.preferences),
      marketingOptIn: dto.marketingOptIn ?? undefined,
      privacyConsent: toJsonInput(dto.privacyConsent),
      // PF
      pfRg: dto.pf?.rg ?? undefined,
      birthDate: dto.pf?.birthDate ? new Date(dto.pf.birthDate) : undefined,
      pfMaritalStatus: dto.pf?.maritalStatus ?? undefined,
      pfProfession: dto.pf?.profession ?? undefined,
      pfIsPEP: dto.pf?.isPEP ?? undefined,
      // PJ
      pjCorporateName: dto.pj?.corporateName ?? undefined,
      pjTradeName: dto.pj?.tradeName ?? undefined,
      pjCnpj: dto.pj?.cnpj ?? undefined,
      pjStateRegistration: dto.pj?.stateRegistration ?? undefined,
      pjMunicipalRegistration: dto.pj?.municipalRegistration ?? undefined,
      pjCNAE: dto.pj?.cnae ?? undefined,
      pjFoundationDate: dto.pj?.foundationDate ? new Date(dto.pj.foundationDate) : undefined,
      pjRepName: dto.pj?.legalRepresentative?.name ?? undefined,
      pjRepCpf: dto.pj?.legalRepresentative?.cpf ?? undefined,
      pjRepEmail: dto.pj?.legalRepresentative?.email ?? undefined,
      pjRepPhone: dto.pj?.legalRepresentative?.phone ?? undefined,
      // Contato principal (legado)
      primaryContactName: dto.primaryContact?.name ?? undefined,
      primaryContactRole: dto.primaryContact?.role ?? undefined,
      primaryContactEmail: dto.primaryContact?.email ?? undefined,
      primaryContactPhone: dto.primaryContact?.phone ?? undefined,
      primaryContactNotes: dto.primaryContact?.notes ?? undefined,
      // Endereço legado
      addressZip: dto.address?.zip ?? undefined,
      addressStreet: dto.address?.street ?? undefined,
      addressNumber: dto.address?.number ?? undefined,
      addressComplement: dto.address?.complement ?? undefined,
      addressDistrict: dto.address?.district ?? undefined,
      addressCity: dto.address?.city ?? undefined,
      addressState: dto.address?.state ?? undefined,
      addressCountry: dto.address?.country ?? undefined,
    };

    const updated = await this.prisma.client.update({
      where: { id },
      data,
    });

    await this.audit.log({
      corretorId,
      entity: 'client',
      entityId: id,
      action: 'UPDATE',
      before: existing,
      after: updated,
      actorId,
      req,
    });

    return updated;
  }

  // ---------- SOFT DELETE / RESTORE ----------
  async softDelete(id: string, corretorId: string, actorId: string, req?: Request) {
    const existing = await this.prisma.client.findFirst({ where: { id, corretorId } });
    if (!existing) throw new NotFoundException('Client not found');

    const updated = await this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.log({
      corretorId,
      entity: 'client',
      entityId: id,
      action: 'DELETE',
      before: existing,
      after: updated,
      actorId,
      req,
    });

    return { ok: true };
  }

  async restore(id: string, corretorId: string, actorId: string, req?: Request) {
    const existing = await this.prisma.client.findFirst({ where: { id, corretorId } });
    if (!existing) throw new NotFoundException('Client not found');

    const updated = await this.prisma.client.update({
      where: { id },
      data: { deletedAt: null },
    });

    await this.audit.log({
      corretorId,
      entity: 'client',
      entityId: id,
      action: 'RESTORE',
      before: existing,
      after: updated,
      actorId,
      req,
    });

    return { ok: true };
  }

  // ---------- ADDRESSES ----------
  async getAddressById(clientId: string, addressId: string, corretorId: string) {
    await this.ensureClientOwnership(clientId, corretorId);
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || address.clientId !== clientId) throw new NotFoundException('Address not found');
    return address;
  }

  async createAddress(clientId: string, corretorId: string, actorId: string, dto: CreateAddressDto, req?: Request) {
    await this.ensureClientOwnership(clientId, corretorId);
    const created = await this.prisma.address.create({ data: { clientId, ...dto } });

    await this.audit.log({
      corretorId,
      entity: 'address',
      entityId: created.id,
      action: 'CREATE',
      before: null,
      after: created,
      actorId,
      req,
    });

    return created;
  }

  async updateAddress(
    clientId: string,
    addressId: string,
    corretorId: string,
    actorId: string,
    dto: UpdateAddressDto,
    req?: Request,
  ) {
    await this.ensureClientOwnership(clientId, corretorId);
    const existing = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!existing || existing.clientId !== clientId) throw new NotFoundException('Address not found');

    const updated = await this.prisma.address.update({ where: { id: addressId }, data: dto });

    await this.audit.log({
      corretorId,
      entity: 'address',
      entityId: addressId,
      action: 'UPDATE',
      before: existing,
      after: updated,
      actorId,
      req,
    });

    return updated;
  }

  async deleteAddress(clientId: string, addressId: string, corretorId: string, actorId: string, req?: Request) {
    await this.ensureClientOwnership(clientId, corretorId);
    const existing = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!existing || existing.clientId !== clientId) throw new NotFoundException('Address not found');

    await this.prisma.address.delete({ where: { id: addressId } });

    await this.audit.log({
      corretorId,
      entity: 'address',
      entityId: addressId,
      action: 'DELETE',
      before: existing,
      after: null,
      actorId,
      req,
    });

    return { ok: true };
  }

  // ---------- CONTACTS ----------
  async getContactById(clientId: string, contactId: string, corretorId: string) {
    await this.ensureClientOwnership(clientId, corretorId);
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact || contact.clientId !== clientId) throw new NotFoundException('Contact not found');
    return contact;
  }

  async createContact(clientId: string, corretorId: string, actorId: string, dto: CreateContactDto, req?: Request) {
    await this.ensureClientOwnership(clientId, corretorId);
    if (dto.isPrimary) {
      await this.prisma.contact.updateMany({ where: { clientId, isPrimary: true }, data: { isPrimary: false } });
    }
    const created = await this.prisma.contact.create({ data: { clientId, ...dto } });

    await this.audit.log({
      corretorId,
      entity: 'contact',
      entityId: created.id,
      action: 'CREATE',
      before: null,
      after: created,
      actorId,
      req,
    });

    return created;
  }

  async updateContact(
    clientId: string,
    contactId: string,
    corretorId: string,
    actorId: string,
    dto: UpdateContactDto,
    req?: Request,
  ) {
    await this.ensureClientOwnership(clientId, corretorId);
    const existing = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!existing || existing.clientId !== clientId) throw new NotFoundException('Contact not found');

    if (dto.isPrimary) {
      await this.prisma.contact.updateMany({
        where: { clientId, isPrimary: true, NOT: { id: contactId } },
        data: { isPrimary: false },
      });
    }

    const updated = await this.prisma.contact.update({ where: { id: contactId }, data: dto });

    await this.audit.log({
      corretorId,
      entity: 'contact',
      entityId: contactId,
      action: 'UPDATE',
      before: existing,
      after: updated,
      actorId,
      req,
    });

    return updated;
  }

  async deleteContact(clientId: string, contactId: string, corretorId: string, actorId: string, req?: Request) {
    await this.ensureClientOwnership(clientId, corretorId);
    const existing = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!existing || existing.clientId !== clientId) throw new NotFoundException('Contact not found');

    await this.prisma.contact.delete({ where: { id: contactId } });

    await this.audit.log({
      corretorId,
      entity: 'contact',
      entityId: contactId,
      action: 'DELETE',
      before: existing,
      after: null,
      actorId,
      req,
    });

    return { ok: true };
  }
}
