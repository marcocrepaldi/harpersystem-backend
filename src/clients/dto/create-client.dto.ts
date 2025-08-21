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

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.toUpperCase() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.toLowerCase() : value);

class PFDto {
  @IsOptional() @Transform(trim) @IsString() rg?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @Transform(trim) @IsString() maritalStatus?: string;
  @IsOptional() @Transform(trim) @IsString() profession?: string;
  @IsOptional() @IsBoolean() isPEP?: boolean;
}

class PJRepDto {
  @IsOptional() @Transform(trim) @IsString() name?: string;
  @IsOptional() @Transform(trim) @IsString() cpf?: string;
  @IsOptional() @Transform(trim) @IsEmail() email?: string;
  @IsOptional() @Transform(trim) @IsString() phone?: string;
}

class PJDto {
  @IsOptional() @Transform(trim) @IsString() corporateName?: string;
  @IsOptional() @Transform(trim) @IsString() tradeName?: string;
  @IsOptional() @Transform(trim) @IsString() cnpj?: string;
  @IsOptional() @Transform(trim) @IsString() stateRegistration?: string;
  @IsOptional() @Transform(trim) @IsString() municipalRegistration?: string;
  @IsOptional() @Transform(trim) @IsString() cnae?: string;
  @IsOptional() @IsDateString() foundationDate?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PJRepDto)
  legalRepresentative?: PJRepDto;
}

class PrimaryContactDto {
  @IsOptional() @Transform(trim) @IsString() name?: string;
  @IsOptional() @Transform(trim) @IsString() role?: string;
  @IsOptional() @Transform(trim) @IsEmail() email?: string;
  @IsOptional() @Transform(trim) @IsString() phone?: string;
  @IsOptional() @Transform(trim) @IsString() notes?: string;
}

class AddressDto {
  @IsOptional() @Transform(trim) @IsString() zip?: string;
  @IsOptional() @Transform(trim) @IsString() street?: string;
  @IsOptional() @Transform(trim) @IsString() number?: string;
  @IsOptional() @Transform(trim) @IsString() complement?: string;
  @IsOptional() @Transform(trim) @IsString() district?: string;
  @IsOptional() @Transform(trim) @IsString() city?: string;
  @IsOptional() @Transform(trim) @IsString() state?: string;
  @IsOptional() @Transform(trim) @IsString() country?: string;
}

export class CreateClientDto {
  @Transform(upper)
  @IsEnum(PersonTypeDto, { message: 'personType must be one of: PF, PJ' })
  personType!: PersonTypeDto;

  @IsOptional()
  @Transform(lower)
  @IsEnum(ClientStatusDto, {
    message: 'status must be one of: lead, prospect, active, inactive',
  })
  status?: ClientStatusDto;

  @Transform(trim)
  @IsString()
  @Length(2, 255, { message: 'name must be between 2 and 255 characters' })
  name!: string;

  @IsOptional() @Transform(trim) @IsString() document?: string;
  @IsOptional() @Transform(trim) @IsEmail() email?: string;
  @IsOptional() @Transform(trim) @IsString() phone?: string;

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
  tags?: string[];

  // ⟵ NOVO: serviços contratados (slugs)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceSlugs?: string[];

  @IsOptional() @IsObject() preferences?: Record<string, unknown>;
  @IsOptional() @IsBoolean() marketingOptIn?: boolean;
  @IsOptional() @IsObject() privacyConsent?: Record<string, unknown>;
}
