// src/policies/policies.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PoliciesService } from "./policies.service";
import { CreatePolicyDto } from "./dto/create-policy.dto";
import { UpdatePolicyDto } from "./dto/update-policy.dto";
import { ListPoliciesQueryDto } from "./dto/list-policies-query.dto";
import { JwtAuthGuard } from "@/auth/guards/jwt-auth.guard";
import { RolesGuard } from "@/auth/guards/roles.guard";
import { Roles } from "@/auth/decorators/roles.decorator";
import { Request } from "express";

type AuthRequest = Request & {
  user: { userId: string; role: "ADMIN" | "USER"; corretorId: string };
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("policies")
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Post()
  async create(@Req() req: AuthRequest, @Body() dto: CreatePolicyDto) {
    return this.policiesService.create(req.user.corretorId, dto);
  }

  @Get()
  async findAll(@Req() req: AuthRequest, @Query() query: ListPoliciesQueryDto) {
    return this.policiesService.findAll(req.user.corretorId, query);
  }

  @Get(":id")
  async findOne(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.policiesService.findOne(req.user.corretorId, id);
  }

  @Patch(":id")
  async update(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: UpdatePolicyDto
  ) {
    return this.policiesService.update(req.user.corretorId, id, dto);
  }

  @Roles("ADMIN")
  @Delete(":id")
  async remove(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.policiesService.remove(req.user.corretorId, id);
  }
}
