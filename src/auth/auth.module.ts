import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { JwtStrategy } from './strategies/jwt.strategy'; // use o seu arquivo existente
import { JwtAuthGuard } from './guards/jwt-auth.guard';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

// importe aqui os módulos que seu AuthService já usa
import { PrismaModule } from '../prisma/prisma.module';
import { TenantsModule } from '../tenant/tenant.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    // registra a estratégia padrão do passport para toda a aplicação
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),

    // mantém JwtModule disponível para DI (não muda seu fluxo)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET', 'dev-secret'),
        signOptions: {
          // não força seu exp; apenas define um default seguro
          expiresIn: cfg.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
      }),
    }),

    PrismaModule,
    TenantsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,   // <<< registra a strategy 'jwt' no Passport
    JwtAuthGuard,
  ],
  exports: [
    PassportModule, // <<< para outros módulos poderem usar AuthGuard('jwt')
    JwtModule,
    JwtAuthGuard,
  ],
})
export class AuthModule {}
