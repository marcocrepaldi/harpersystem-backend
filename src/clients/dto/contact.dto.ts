import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateContactDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class UpdateContactDto extends CreateContactDto {}
