import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  Req,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadBase64Dto } from './dto/upload-base64.dto';

import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { TenantResolver } from '@/common/tenant/tenant.resolver';

@UseGuards(JwtAuthGuard)
@Controller('/clients/:clientId/documents')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly service: DocumentsService,
    private readonly tenantResolver: TenantResolver,
  ) {}

  /** CREATE (metadados; arquivo já gravado em storageKey) */
  @Post()
  async create(
    @Param('clientId') clientId: string,
    @Body() dto: CreateDocumentDto,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const corretorId = await this.tenantResolver.resolve(req, user);
    return this.service.create(corretorId, clientId, dto, user?.userId);
  }

  /** UPLOAD BASE64 (grava localmente em /uploads) */
  @Post('upload-base64')
  async uploadBase64(
    @Param('clientId') clientId: string,
    @Body() dto: UploadBase64Dto,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const corretorId = await this.tenantResolver.resolve(req, user);
    this.logger.log(
      `upload-base64: user=${user?.userId ?? '-'} corretorId=${corretorId} clientId=${clientId}`,
    );
    return this.service.uploadBase64(corretorId, clientId, dto, user?.userId);
  }

  /** LIST */
  @Get()
  async list(
    @Param('clientId') clientId: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('policyId') policyId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any,
    @Req() req?: any,
  ) {
    const corretorId = await this.tenantResolver.resolve(req, user);
    return this.service.list(corretorId, clientId, {
      q,
      category,
      policyId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** GET (detalhe) */
  @Get(':id')
  async getOne(
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const corretorId = await this.tenantResolver.resolve(req, user);
    return this.service.get(corretorId, clientId, id);
  }

  /** DOWNLOAD */
  @Get(':id/download')
  async download(
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const corretorId = await this.tenantResolver.resolve(req, user);
    const { doc, stream } = await this.service.getFileStream(corretorId, clientId, id);

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.filename)}"`,
    );
    res.setHeader('Cache-Control', 'no-store');

    stream.pipe(res);
  }

  /** UPDATE */
  @Patch(':id')
  async update(
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const corretorId = await this.tenantResolver.resolve(req, user);
    return this.service.update(corretorId, clientId, id, dto);
  }

  /** DELETE (soft) */
  @Delete(':id')
  async remove(
    @Param('clientId') clientId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const corretorId = await this.tenantResolver.resolve(req, user);
    return this.service.softDelete(corretorId, clientId, id, user?.userId);
  }
}
