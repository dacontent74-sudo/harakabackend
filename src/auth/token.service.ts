import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrincipalType } from './principal';
import { TOKEN_TTL } from './jwt.config';

/** Issues signed JWTs for every principal type (staff, courier, merchant). */
@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  issue(type: PrincipalType, sub: number, claims: Record<string, unknown> = {}): string {
    return this.jwtService.sign({ ...claims, sub, type }, { expiresIn: TOKEN_TTL[type] });
  }
}
