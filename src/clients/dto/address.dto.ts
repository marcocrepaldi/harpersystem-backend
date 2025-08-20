import { IsOptional, IsString, IsIn } from 'class-validator';

const ALLOWED_TYPES = ['COBRANCA', 'RESIDENCIAL', 'COMERCIAL', 'OUTRO'] as const;
export type AddressType = (typeof ALLOWED_TYPES)[number];

export class CreateAddressDto {
  @IsString()
  @IsIn(ALLOWED_TYPES, { message: 'type must be one of: COBRANCA, RESIDENCIAL, COMERCIAL, OUTRO' })
  type!: AddressType;

  @IsOptional() @IsString() zip?: string;
  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() complement?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;
}

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_TYPES, { message: 'type must be one of: COBRANCA, RESIDENCIAL, COMERCIAL, OUTRO' })
  type?: AddressType;

  @IsOptional() @IsString() zip?: string;
  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() complement?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;
}
