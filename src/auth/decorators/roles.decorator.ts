import { SetMetadata, UseGuards, applyDecorators, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { AnyRole, AuthPrincipal } from '../principal';

import { ROLES_KEY } from './roles.key';
export { ROLES_KEY };
export const Roles = (...roles: AnyRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Require a valid JWT and (optionally) one of the given roles.
 *
 *   @Auth()                       any authenticated principal
 *   @Auth(...STAFF_WRITE)         staff with write access
 *   @Auth(COURIER_ROLE)           couriers only
 *   @Auth(MERCHANT_ROLE, ...STAFF_ALL)  restaurant owner or any staff
 */
export function Auth(...roles: AnyRole[]) {
  return applyDecorators(SetMetadata(ROLES_KEY, roles.length ? roles : undefined), UseGuards(JwtAuthGuard, RolesGuard));
}

/** Injects the authenticated principal (req.user). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => ctx.switchToHttp().getRequest().user,
);
