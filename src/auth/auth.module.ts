// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET não configurado');

        const issuer = cfg.get<string>('JWT_ISSUER');
        const audience = cfg.get<string>('JWT_AUDIENCE');

        // monte as opções sem colocar campos vazios/undefined
        const signOptions: Record<string, unknown> = {};
        if (typeof issuer === 'string' && issuer.trim()) {
          signOptions.issuer = issuer.trim();
        }
        if (typeof audience === 'string' && audience.trim()) {
          signOptions.audience = audience.trim();
        }

        return {
          secret,
          signOptions, // opções padrão; `expiresIn` você já define por chamada em AuthService
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
