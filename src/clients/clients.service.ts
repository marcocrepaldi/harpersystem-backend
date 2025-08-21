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

type IncludeKey = 'addresses' | 'contacts' | 'services' | 'tags';

/* --------------------------------- HELPERS --------------------------------- */

function emptyToUndef<T>(v: T): T | undefined {
  return typeof v === 'string' && v === '' ? undefined : v;
}

function cleanEmptyStrings<T extends Record<string, any>>(obj?: T): Partial<T> {
  if (!obj) return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? undefined : v;
  return out as Partial<T>;
}

function omitUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}

function mapStatus(s?: ClientStatusDto): ClientStatus | undefined {
  if (!s) return undefined;
  const key = String(s).toUpperCase() as keyof typeof ClientStatus;
  return ClientStatus[key] ?? undefined;
}

function mapPersonType(p: PersonTypeDto): PersonType {
  const key = String(p).toUpperCase() as keyof typeof PersonType;
  return PersonType[key] ?? PersonType.PF;
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async ensureClientOwnership(clientId: string, corretorId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, corretorId },
      select: { id: true },
    });
    if (!client) throw new ForbiddenException('Client does not belong to your tenant');
  }

  private buildInclude(includeRels: boolean | IncludeKey[] | undefined): Prisma.ClientInclude | undefined {
    if (includeRels === true) {
      return {
        addresses: { orderBy: { createdAt: 'asc' } },
        contacts: { orderBy: { createdAt: 'asc' } },
        services: { include: { service: true } },
        tagLinks: { include: { tag: true } },
      };
    }
    if (Array.isArray(includeRels)) {
      return {
        addresses: includeRels.includes('addresses') ? { orderBy: { createdAt: 'asc' } } : false,
        contacts: includeRels.includes('contacts') ? { orderBy: { createdAt: 'asc' } } : false,
        services: includeRels.includes('services') ? { include: { service: true } } : false,
        tagLinks: includeRels.includes('tags') ? { include: { tag: true } } : false,
      } as Prisma.ClientInclude;
    }
    return undefined;
  }

  private async mapServiceSlugsToCreate(slugs?: string[]) {
    if (!slugs?.length) return [];
    const services = await this.prisma.service.findMany({ where: { slug: { in: slugs } } });
    if (!services.length) return [];
    return services.map((s) => ({ service: { connect: { id: s.id } } }));
  }

  private async mapTagSlugsToCreate(slugs?: string[]) {
    if (!slugs?.length) return [];
    const rows: Array<{ id: string }> = [];
    for (const slug of slugs) {
      const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const tag = await this.prisma.tag.upsert({
        where: { slug },
        update: { isActive: true },
        create: { slug, name },
      });
      rows.push({ id: tag.id });
    }
    return rows.map((t) => ({ tag: { connect: { id: t.id } } }));
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
      ...(query.service
        ? { services: { some: { service: { slug: query.service, isActive: true } } } }
        : undefined),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, phone: true,
          document: true, birthDate: true, status: true,
          personType: true, createdAt: true, updatedAt: true,
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
    const include = this.buildInclude(includeRels);

    const client = await this.prisma.client.findFirst({
      where: { id, corretorId, deletedAt: null },
      include,
    });
    if (!client) throw new NotFoundException('Client not found');

    const wantsServices =
      includeRels === true || (Array.isArray(includeRels) && includeRels.includes('services'));
    const wantsTags =
      includeRels === true || (Array.isArray(includeRels) && includeRels.includes('tags'));

    const address = {
      zip: client.addressZip ?? undefined,
      street: client.addressStreet ?? undefined,
      number: client.addressNumber ?? undefined,
      complement: client.addressComplement ?? undefined,
      district: client.addressDistrict ?? undefined,
      city: client.addressCity ?? undefined,
      state: client.addressState ?? undefined,
      country: client.addressCountry ?? undefined,
    };

    const primaryContact = {
      name: client.primaryContactName ?? undefined,
      role: client.primaryContactRole ?? undefined,
      email: client.primaryContactEmail ?? undefined,
      phone: client.primaryContactPhone ?? undefined,
      notes: client.primaryContactNotes ?? undefined,
    };

    if (wantsServices || wantsTags) {
      const [serviceLinks, tagLinks] = await Promise.all([
        wantsServices
          ? this.prisma.clientService.findMany({
              where: { clientId: id },
              include: { service: true },
              orderBy: { service: { name: 'asc' } },
            })
          : Promise.resolve([] as Array<{ service: { slug: string } }>),
        wantsTags
          ? this.prisma.clientTag.findMany({
              where: { clientId: id },
              include: { tag: true },
              orderBy: { tag: { name: 'asc' } },
            })
          : Promise.resolve([] as Array<{ tag: { slug: string } }>),
      ]);

      return {
        ...client,
        address,
        primaryContact,
        ...(wantsServices ? { serviceSlugs: serviceLinks.map((cs) => cs.service.slug) } : {}),
        ...(wantsTags ? { tagSlugs: tagLinks.map((ct) => ct.tag.slug) } : {}),
      };
    }

    return { ...client, address, primaryContact };
  }

  // ---------- CREATE ----------
  async create(corretorId: string, actorId: string, dto: CreateClientDto, req?: Request) {
    const data: Prisma.ClientCreateInput = {
      corretor: { connect: { id: corretorId } },
      name: emptyToUndef(dto.name)!,
      email: emptyToUndef(dto.email),
      phone: emptyToUndef(dto.phone),
      document: emptyToUndef(dto.document),
      personType: mapPersonType(dto.personType),
      status: mapStatus(dto.status) ?? ClientStatus.ACTIVE,
      tags: dto.tags ?? [],
      preferences: toJsonInput(dto.preferences),
      marketingOptIn: dto.marketingOptIn ?? false,
      privacyConsent: toJsonInput(dto.privacyConsent),

      // PF
      pfRg: emptyToUndef(dto.pf?.rg),
      birthDate: dto.pf?.birthDate ? new Date(dto.pf.birthDate) : undefined,
      pfMaritalStatus: emptyToUndef(dto.pf?.maritalStatus),
      pfProfession: emptyToUndef(dto.pf?.profession),
      pfIsPEP: dto.pf?.isPEP ?? undefined,

      // PJ
      pjCorporateName: emptyToUndef(dto.pj?.corporateName),
      pjTradeName: emptyToUndef(dto.pj?.tradeName),
      pjCnpj: emptyToUndef(dto.pj?.cnpj),
      pjStateRegistration: emptyToUndef(dto.pj?.stateRegistration),
      pjMunicipalRegistration: emptyToUndef(dto.pj?.municipalRegistration),
      pjCNAE: emptyToUndef(dto.pj?.cnae),
      pjFoundationDate: dto.pj?.foundationDate ? new Date(dto.pj.foundationDate) : undefined,
      pjRepName: emptyToUndef(dto.pj?.legalRepresentative?.name),
      pjRepCpf: emptyToUndef(dto.pj?.legalRepresentative?.cpf),
      pjRepEmail: emptyToUndef(dto.pj?.legalRepresentative?.email),
      pjRepPhone: emptyToUndef(dto.pj?.legalRepresentative?.phone),

      // Contato principal (legado)
      primaryContactName: emptyToUndef(dto.primaryContact?.name),
      primaryContactRole: emptyToUndef(dto.primaryContact?.role),
      primaryContactEmail: emptyToUndef(dto.primaryContact?.email),
      primaryContactPhone: emptyToUndef(dto.primaryContact?.phone),
      primaryContactNotes: emptyToUndef(dto.primaryContact?.notes),

      // Endereço legado
      addressZip: emptyToUndef(dto.address?.zip),
      addressStreet: emptyToUndef(dto.address?.street),
      addressNumber: emptyToUndef(dto.address?.number),
      addressComplement: emptyToUndef(dto.address?.complement),
      addressDistrict: emptyToUndef(dto.address?.district),
      addressCity: emptyToUndef(dto.address?.city),
      addressState: emptyToUndef(dto.address?.state),
      addressCountry: emptyToUndef(dto.address?.country),

      // N:N — cria apenas se vierem definidos
      ...(dto.serviceSlugs !== undefined && {
        services: { create: await this.mapServiceSlugsToCreate(dto.serviceSlugs) },
      }),
      ...(dto.tags !== undefined && {
        tagLinks: { create: await this.mapTagSlugsToCreate(dto.tags) },
      }),
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

    const base: Prisma.ClientUpdateInput = omitUndefined({
      name: emptyToUndef(dto.name),
      email: emptyToUndef(dto.email),
      phone: emptyToUndef(dto.phone),
      document: emptyToUndef(dto.document),
      personType: dto.personType ? mapPersonType(dto.personType) : undefined,
      status: mapStatus(dto.status),

      ...(dto.tags !== undefined ? { tags: { set: dto.tags } } : {}),

      preferences: toJsonInput(dto.preferences),
      marketingOptIn: dto.marketingOptIn ?? undefined,
      privacyConsent: toJsonInput(dto.privacyConsent),

      // PF
      pfRg: emptyToUndef(dto.pf?.rg),
      birthDate: dto.pf?.birthDate ? new Date(dto.pf.birthDate) : undefined,
      pfMaritalStatus: emptyToUndef(dto.pf?.maritalStatus),
      pfProfession: emptyToUndef(dto.pf?.profession),
      pfIsPEP: dto.pf?.isPEP ?? undefined,

      // PJ
      pjCorporateName: emptyToUndef(dto.pj?.corporateName),
      pjTradeName: emptyToUndef(dto.pj?.tradeName),
      pjCnpj: emptyToUndef(dto.pj?.cnpj),
      pjStateRegistration: emptyToUndef(dto.pj?.stateRegistration),
      pjMunicipalRegistration: emptyToUndef(dto.pj?.municipalRegistration),
      pjCNAE: emptyToUndef(dto.pj?.cnae),
      pjFoundationDate: dto.pj?.foundationDate ? new Date(dto.pj.foundationDate) : undefined,
      pjRepName: emptyToUndef(dto.pj?.legalRepresentative?.name),
      pjRepCpf: emptyToUndef(dto.pj?.legalRepresentative?.cpf),
      pjRepEmail: emptyToUndef(dto.pj?.legalRepresentative?.email),
      pjRepPhone: emptyToUndef(dto.pj?.legalRepresentative?.phone),

      // Contato principal (legado)
      primaryContactName: emptyToUndef(dto.primaryContact?.name),
      primaryContactRole: emptyToUndef(dto.primaryContact?.role),
      primaryContactEmail: emptyToUndef(dto.primaryContact?.email),
      primaryContactPhone: emptyToUndef(dto.primaryContact?.phone),
      primaryContactNotes: emptyToUndef(dto.primaryContact?.notes),

      // Endereço legado
      addressZip: emptyToUndef(dto.address?.zip),
      addressStreet: emptyToUndef(dto.address?.street),
      addressNumber: emptyToUndef(dto.address?.number),
      addressComplement: emptyToUndef(dto.address?.complement),
      addressDistrict: emptyToUndef(dto.address?.district),
      addressCity: emptyToUndef(dto.address?.city),
      addressState: emptyToUndef(dto.address?.state),
      addressCountry: emptyToUndef(dto.address?.country),
    });

    if (dto.serviceSlugs !== undefined) {
      base.services = {
        deleteMany: {},
        create: await this.mapServiceSlugsToCreate(dto.serviceSlugs),
      };
    }
    if (dto.tags !== undefined) {
      base.tagLinks = {
        deleteMany: {},
        create: await this.mapTagSlugsToCreate(dto.tags),
      };
    }

    const updated = await this.prisma.client.update({ where: { id }, data: base });

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
      corretorId, entity: 'client', entityId: id,
      action: 'DELETE', before: existing, after: updated, actorId, req,
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
      corretorId, entity: 'client', entityId: id,
      action: 'RESTORE', before: existing, after: updated, actorId, req,
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
    const cleaned = omitUndefined(cleanEmptyStrings(dto));
    const created = await this.prisma.address.create({ data: { clientId, ...cleaned } });

    await this.audit.log({
      corretorId, entity: 'address', entityId: created.id,
      action: 'CREATE', before: null, after: created, actorId, req,
    });

    return created;
  }

  async updateAddress(
    clientId: string, addressId: string, corretorId: string,
    actorId: string, dto: UpdateAddressDto, req?: Request,
  ) {
    await this.ensureClientOwnership(clientId, corretorId);
    const existing = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!existing || existing.clientId !== clientId) throw new NotFoundException('Address not found');

    const cleaned = omitUndefined(cleanEmptyStrings(dto));
    const updated = await this.prisma.address.update({ where: { id: addressId }, data: cleaned });

    await this.audit.log({
      corretorId, entity: 'address', entityId: addressId,
      action: 'UPDATE', before: existing, after: updated, actorId, req,
    });

    return updated;
  }

  async deleteAddress(clientId: string, addressId: string, corretorId: string, actorId: string, req?: Request) {
    await this.ensureClientOwnership(clientId, corretorId);
    const existing = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!existing || existing.clientId !== clientId) throw new NotFoundException('Address not found');

    await this.prisma.address.delete({ where: { id: addressId } });

    await this.audit.log({
      corretorId, entity: 'address', entityId: addressId,
      action: 'DELETE', before: existing, after: null, actorId, req,
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
    const cleaned = omitUndefined(cleanEmptyStrings(dto));
    const created = await this.prisma.contact.create({ data: { clientId, ...cleaned } });

    await this.audit.log({
      corretorId, entity: 'contact', entityId: created.id,
      action: 'CREATE', before: null, after: created, actorId, req,
    });

    return created;
  }

  async updateContact(
    clientId: string, contactId: string, corretorId: string,
    actorId: string, dto: UpdateContactDto, req?: Request,
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

    const cleaned = omitUndefined(cleanEmptyStrings(dto));
    const updated = await this.prisma.contact.update({ where: { id: contactId }, data: cleaned });

    await this.audit.log({
      corretorId, entity: 'contact', entityId: contactId,
      action: 'UPDATE', before: existing, after: updated, actorId, req,
    });

    return updated;
  }

  async deleteContact(clientId: string, contactId: string, corretorId: string, actorId: string, req?: Request) {
    await this.ensureClientOwnership(clientId, corretorId);
    const existing = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!existing || existing.clientId !== clientId) throw new NotFoundException('Contact not found');

    await this.prisma.contact.delete({ where: { id: contactId } });

    await this.audit.log({
      corretorId, entity: 'contact', entityId: contactId,
      action: 'DELETE', before: existing, after: null, actorId, req,
    });

    return { ok: true };
  }
}
