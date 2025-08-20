import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateCorretorDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Transform(({ value }) => String(value ?? "").replace(/\D/g, "")) // mantém só dígitos
  @Matches(/^(?:\d{11}|\d{14})$/, {
    message: "cpfCnpj deve conter 11 (CPF) ou 14 (CNPJ) dígitos",
  })
  cpfCnpj!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value == null ? value : String(value).replace(/\D/g, ""))) // só dígitos
  phone?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(63)
  @Transform(({ value }) => String(value).trim().toLowerCase())
  // DNS label: começa e termina com [a-z0-9], hífen apenas no meio
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/, {
    message: "subdomain inválido (use a–z, 0–9, hífen no meio; 2–63 chars)",
  })
  subdomain!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(63)
  @Transform(({ value }) => String(value).trim().toLowerCase())
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/, {
    message: "slug inválido (use a–z, 0–9, hífen no meio; 2–63 chars)",
  })
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(({ value }) =>
    value ? String(value).trim().toUpperCase() : value
  )
  @Matches(/^[A-Z0-9-]+$/, {
    message: "tenantCode deve conter apenas A–Z, 0–9 e hífen",
  })
  tenantCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
