import { Controller, Get, Query } from '@nestjs/common';
import { ServicesService } from './services.service';

@Controller('services')
export class ServicesController {
  constructor(private readonly service: ServicesService) {}

  @Get()
  list(@Query('active') active?: string) {
    const onlyActive =
      typeof active === 'string'
        ? ['1', 'true', 'yes'].includes(active.toLowerCase())
        : undefined;
    return this.service.findAll(onlyActive);
  }
}
