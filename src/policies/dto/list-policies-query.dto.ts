// src/policies/dto/list-policies-query.dto.ts
import { IsEnum, IsInt, IsOptional, IsString, Min, Max } from "class-validator";
import { Type } from "class-transformer";
import { PolicyStatus } from "@prisma/client";

export class ListPoliciesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PolicyStatus)
  status?: PolicyStatus;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
