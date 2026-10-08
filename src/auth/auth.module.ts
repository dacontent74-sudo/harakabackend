import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from './entities/user.entity';
import { AuditLog } from './entities/audit-log.entity';
import { Courier } from '../couriers/entities/courier.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';
import { getJwtSecret, TOKEN_TTL } from './jwt.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AuditLog, Courier, Merchant]),
    PassportModule,
    // registerAsync so the secret is read after ConfigModule has loaded .env
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getJwtSecret(),
        signOptions: { expiresIn: TOKEN_TTL.staff, algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenService],
  exports: [AuthService, TokenService, PassportModule],
})
export class AuthModule {}
