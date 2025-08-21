import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum PersonTypeDto {
  PF = 'PF',
  PJ = 'PJ',
}
export enum ClientStatusDto {
  lead = 'lead',
  prospect = 'prospect',
  active = 'active',
  inactive = 'inactive',
}

/**
 * Importante: @IsOptional() IGNORA somente null/undefined.
 * Para evitar sobrescrever com vazio, primeiro convertemos '' -> undefined.
 */
const emptyToUndef = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase() : value;

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase() : value;

/* ----------------------------- Sub-objetos ----------------------------- */

class PFDto {
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() rg?: string;
  @Transform(emptyToUndef) @IsOptional() @IsDateString() birthDate?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() maritalStatus?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() profession?: string;
  @IsOptional() @IsBoolean() isPEP?: boolean;
}

class PJRepDto {
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() name?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() cpf?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsEmail() email?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() phone?: string;
}

class PJDto {
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() corporateName?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() tradeName?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() cnpj?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() stateRegistration?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() municipalRegistration?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() cnae?: string;
  @Transform(emptyToUndef) @IsOptional() @IsDateString() foundationDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PJRepDto)
  legalRepresentative?: PJRepDto;
}

class PrimaryContactDto {
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() name?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() role?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsEmail() email?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() phone?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() notes?: string;
}

class AddressDto {
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() zip?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() street?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() number?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() complement?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() district?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() city?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() state?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() country?: string;
}

/* ------------------------------ DTO principal ------------------------------ */

export class UpdateClientDto {
  @Transform(emptyToUndef) @IsOptional()
  @Transform(upper)
  @IsEnum(PersonTypeDto, { message: 'personType must be one of: PF, PJ' })
  personType?: PersonTypeDto;

  @Transform(emptyToUndef) @IsOptional()
  @Transform(lower)
  @IsEnum(ClientStatusDto, {
    message: 'status must be one of: lead, prospect, active, inactive',
  })
  status?: ClientStatusDto;

  @Transform(emptyToUndef) @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 255, { message: 'name must be between 2 and 255 characters' })
  name?: string;

  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() document?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsEmail() email?: string;
  @Transform(emptyToUndef) @IsOptional() @Transform(trim) @IsString() phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PFDto)
  pf?: PFDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PJDto)
  pj?: PJDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PrimaryContactDto)
  primaryContact?: PrimaryContactDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]; // se vier undefined -> não mexe; se vier [] -> limpa

  // Serviços contratados (slugs)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceSlugs?: string[]; // mesma semântica de tags

  @IsOptional() @IsObject() preferences?: Record<string, unknown>;
  @IsOptional() @IsBoolean() marketingOptIn?: boolean;
  @IsOptional() @IsObject() privacyConsent?: Record<string, unknown>;

  // Controle de concorrência (opcional)
  @Transform(emptyToUndef) @IsOptional() @IsDateString()
  expectedUpdatedAt?: string;
}
