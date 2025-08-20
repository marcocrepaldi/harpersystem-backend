// src/policies/dto/create-policy.dto.ts
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, IsDecimal } from "class-validator";
import { PolicyStatus } from "@prisma/client";

export class CreatePolicyDto {
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  policyNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  insurer!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  product?: string;

  @IsDateString()
  startDate!: string; // YYYY-MM-DD

  @IsOptional()
  @IsDateString()
  endDate?: string; // YYYY-MM-DD

  // class-validator trata decimal como string
  @IsDecimal({ decimal_digits: "0,2", force_decimal: false, locale: "en-US" })
  premium!: string;

  @IsOptional()
  @IsEnum(PolicyStatus)
  status?: PolicyStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
