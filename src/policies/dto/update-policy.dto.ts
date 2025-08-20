// src/policies/dto/update-policy.dto.ts
import { PartialType } from "@nestjs/mapped-types";
import { CreatePolicyDto } from "./create-policy.dto";

export class UpdatePolicyDto extends PartialType(CreatePolicyDto) {}
