import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CorretoresService } from "./corretores.service";
import { CreateCorretorDto } from "./dto/create-corretor.dto";

@Controller("corretores") // <— sem 'api', o prefixo já vem do main.ts
export class CorretoresController {
  constructor(private readonly svc: CorretoresService) {}

  @Get()
  list() {
    return this.svc.findAll();
  }

  // coloque antes de ':id' para evitar conflito de roteamento
  @Get("by-slug/:slug")
  bySlug(@Param("slug") slug: string) {
    return this.svc.findBySlug(slug.toLowerCase());
  }

  @Get(":id")
  byId(@Param("id") id: string) {
    return this.svc.findById(id);
  }

  @Post()
  create(@Body() dto: CreateCorretorDto) {
    return this.svc.create(dto);
  }
}
