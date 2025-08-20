import { IsEmail, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '@prisma/client';

export class UpdateUserDto {
  @IsString() @IsOptional()
  @Length(3, 100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsEmail() @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsString() @IsOptional()
  @Length(8, 72)
  password?: string;

  @IsEnum(Role) @IsOptional()
  role?: Role;

  @IsOptional()
  isActive?: boolean;
}
