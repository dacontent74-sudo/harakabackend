import { UserRole } from './entities/user.entity';

/**
 * Every authenticated request carries one of three principal types.
 * All of them are signed with the same JWT_SECRET and distinguished by the
 * `type` claim, so one guard (JwtAuthGuard) handles all of them.
 */
export type PrincipalType = 'staff' | 'courier' | 'merchant';

/** Non-staff pseudo roles, used with @Auth()/@Roles(). */
export const COURIER_ROLE = 'courier';
export const MERCHANT_ROLE = 'merchant';

export type AnyRole = UserRole | typeof COURIER_ROLE | typeof MERCHANT_ROLE;

export interface AuthPrincipal {
  type: PrincipalType;
  id: number;
  role: AnyRole;
  /** staff: email, courier: phone number, merchant: restaurant name */
  email?: string;
  fullName?: string;
  name?: string;
  phoneNumber?: string;
}

/** Role groups used across controllers. */
export const STAFF_ALL: AnyRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.SUPPORT,
  UserRole.VIEWER,
];

/** Staff who may create/modify restaurants, menus and orders. */
export const STAFF_WRITE: AnyRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];

/** Staff who may perform money-moving or destructive admin actions. */
export const STAFF_ADMIN: AnyRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

export function isStaff(p?: AuthPrincipal | null): boolean {
  return !!p && p.type === 'staff';
}
