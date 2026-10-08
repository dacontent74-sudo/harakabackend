import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Courier } from '../../couriers/entities/courier.entity';
import { Merchant } from '../../merchants/entities/merchant.entity';
import { getJwtSecret } from '../jwt.config';
import { AuthPrincipal, COURIER_ROLE, MERCHANT_ROLE } from '../principal';

/**
 * Validates every Bearer token and re-loads the principal from the database
 * on each request, so deactivating a staff user, courier or restaurant
 * revokes access immediately (even if their token has not expired yet).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Courier)
    private courierRepository: Repository<Courier>,
    @InjectRepository(Merchant)
    private merchantRepository: Repository<Merchant>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: any): Promise<AuthPrincipal> {
    const id = Number(payload?.sub);
    if (!Number.isInteger(id) || id <= 0) {
      throw new UnauthorizedException('Invalid token');
    }

    // Tokens issued before principal types existed are staff tokens.
    const type = payload.type || 'staff';

    if (type === 'courier') {
      const courier = await this.courierRepository.findOne({ where: { id } });
      if (!courier || !courier.isActive || courier.isApproved === false) {
        throw new UnauthorizedException('Courier account is not active');
      }
      return {
        type: 'courier',
        id: courier.id,
        role: COURIER_ROLE,
        name: courier.name,
        phoneNumber: courier.phoneNumber,
      };
    }

    if (type === 'merchant') {
      const merchant = await this.merchantRepository.findOne({ where: { id } });
      if (!merchant || !merchant.isActive) {
        throw new UnauthorizedException('Restaurant account is not active');
      }
      return {
        type: 'merchant',
        id: merchant.id,
        role: MERCHANT_ROLE,
        name: merchant.name,
        phoneNumber: merchant.phone,
      };
    }

    if (type !== 'staff') {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is not active');
    }
    return {
      type: 'staff',
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };
  }
}
