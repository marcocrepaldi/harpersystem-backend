import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  root() {
    return {
      ok: true,
      service: 'api',
      version: process.env.npm_package_version ?? '0.0.0',
      message: this.appService.getHello(),
      timestamp: new Date().toISOString(),
    };
  }
}
