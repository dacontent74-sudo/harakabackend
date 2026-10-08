import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User, UserRole } from './entities/user.entity';
import { AuditLog, AuditAction } from './entities/audit-log.entity';
import { TokenService } from './token.service';

export const BCRYPT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 8;

/** Throws if a password does not meet the minimum policy. */
export function assertStrongPassword(password: unknown, min = MIN_PASSWORD_LENGTH): string {
  if (typeof password !== 'string' || password.length < min) {
    throw new BadRequestException(`Password must be at least ${min} characters`);
  }
  if (password.length > 128) {
    throw new BadRequestException('Password is too long');
  }
  return password;
}

const VALID_ROLES = Object.values(UserRole) as string[];
const PRIVILEGED_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

// A precomputed hash so login takes the same time whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    private tokenService: TokenService,
  ) {}

  async login(email: string, password: string, ipAddress?: string) {
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Match exact (legacy mixed-case accounts) or normalised lowercase email.
    const user = await this.userRepository.findOne({
      where: [{ email: email.trim() }, { email: email.trim().toLowerCase() }],
    });

    // Always run bcrypt to avoid leaking which emails exist via response timing.
    const isPasswordValid = await bcrypt.compare(password, user?.password || DUMMY_HASH);

    if (!user || !isPasswordValid) {
      this.logger.warn(`Failed staff login for ${email} from ${ipAddress}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    user.lastLoginAt = new Date();
    user.lastLoginIp = ipAddress;
    await this.userRepository.save(user);

    await this.logActivity(user.id, AuditAction.LOGIN, 'user', user.id.toString(), { email: user.email }, ipAddress);

    const token = this.tokenService.issue('staff', user.id, {
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    });

    this.logger.log(`User logged in: ${user.email}`);

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        lastLoginAt: user.lastLoginAt,
      },
    };
  }

  async register(
    data: {
      email: string;
      password: string;
      fullName: string;
      role?: UserRole;
      phoneNumber?: string;
    },
    creator: { id: number; role: string },
  ) {
    if (!data || typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      throw new BadRequestException('A valid email is required');
    }
    if (typeof data.fullName !== 'string' || !data.fullName.trim()) {
      throw new BadRequestException('Full name is required');
    }
    assertStrongPassword(data.password);

    const role = (data.role || UserRole.VIEWER) as UserRole;
    if (!VALID_ROLES.includes(role)) {
      throw new BadRequestException(`Invalid role. Allowed: ${VALID_ROLES.join(', ')}`);
    }
    // Only a super admin may create admins / super admins (prevents privilege escalation).
    if (PRIVILEGED_ROLES.includes(role) && creator.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can create admin accounts');
    }

    const email = data.email.trim().toLowerCase();
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const user = this.userRepository.create({
      email,
      password: await bcrypt.hash(data.password, BCRYPT_ROUNDS),
      fullName: data.fullName.trim(),
      role,
      phoneNumber: data.phoneNumber,
      createdBy: creator.id,
      isActive: true,
    });

    const savedUser = await this.userRepository.save(user);

    await this.logActivity(creator.id, AuditAction.CREATE, 'user', savedUser.id.toString(), { email, role });

    this.logger.log(`New user registered: ${email} with role ${role}`);

    return {
      success: true,
      user: {
        id: savedUser.id,
        email: savedUser.email,
        fullName: savedUser.fullName,
        role: savedUser.role,
      },
    };
  }

  async getMe(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      phoneNumber: user.phoneNumber,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  async getAllUsers() {
    const users = await this.userRepository.find({
      order: { createdAt: 'DESC' },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      phoneNumber: user.phoneNumber,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    }));
  }

  async updateUser(userId: number, data: Record<string, any>, updatedBy: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Whitelist updatable fields - never allow id/email/createdBy/lastLogin* to be overwritten.
    const changes: Partial<User> = {};
    if (data.fullName !== undefined) changes.fullName = String(data.fullName).trim();
    if (data.phoneNumber !== undefined) changes.phoneNumber = data.phoneNumber;
    if (data.role !== undefined) {
      if (!VALID_ROLES.includes(data.role)) {
        throw new BadRequestException(`Invalid role. Allowed: ${VALID_ROLES.join(', ')}`);
      }
      changes.role = data.role;
    }
    if (data.isActive !== undefined) changes.isActive = !!data.isActive;
    if (data.password !== undefined && data.password !== '') {
      changes.password = await bcrypt.hash(assertStrongPassword(data.password), BCRYPT_ROUNDS);
    }

    // Never let the last active super admin lock everyone out.
    const losingSuperAdmin =
      user.role === UserRole.SUPER_ADMIN &&
      ((changes.role && changes.role !== UserRole.SUPER_ADMIN) || changes.isActive === false);
    if (losingSuperAdmin) {
      const activeSuperAdmins = await this.userRepository.count({
        where: { role: UserRole.SUPER_ADMIN, isActive: true },
      });
      if (activeSuperAdmins <= 1) {
        throw new BadRequestException('Cannot demote or deactivate the last active super admin');
      }
    }

    Object.assign(user, changes);
    const updated = await this.userRepository.save(user);

    await this.logActivity(updatedBy, AuditAction.UPDATE, 'user', userId.toString(), {
      updatedFields: Object.keys(changes),
    });

    this.logger.log(`User updated: ${user.email} by user ${updatedBy}`);

    return {
      success: true,
      user: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
        isActive: updated.isActive,
      },
    };
  }

  async changeOwnPassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const ok = typeof currentPassword === 'string' && (await bcrypt.compare(currentPassword, user.password));
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    user.password = await bcrypt.hash(assertStrongPassword(newPassword), BCRYPT_ROUNDS);
    await this.userRepository.save(user);
    await this.logActivity(userId, AuditAction.UPDATE, 'user', userId.toString(), { passwordChanged: true });

    return { success: true, message: 'Password changed' };
  }

  async deleteUser(userId: number, deletedBy: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (userId === deletedBy) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    if (user.role === UserRole.SUPER_ADMIN) {
      const activeSuperAdmins = await this.userRepository.count({
        where: { role: UserRole.SUPER_ADMIN, isActive: true },
      });
      if (activeSuperAdmins <= 1) {
        throw new BadRequestException('Cannot deactivate the last active super admin');
      }
    }

    // Soft delete - deactivate instead of removing
    user.isActive = false;
    await this.userRepository.save(user);

    await this.logActivity(deletedBy, AuditAction.DELETE, 'user', userId.toString(), { email: user.email });

    this.logger.log(`User deactivated: ${user.email} by user ${deletedBy}`);

    return {
      success: true,
      message: 'User deactivated',
    };
  }

  async getAuditLogs(limit = 100, offset = 0) {
    const logs = await this.auditLogRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit || 100, 1), 500),
      skip: Math.max(offset || 0, 0),
    });

    return logs.map((log) => ({
      id: log.id,
      user: log.user
        ? {
            id: log.user.id,
            email: log.user.email,
            fullName: log.user.fullName,
          }
        : null,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      details: log.details,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    }));
  }

  async logActivity(
    userId: number,
    action: AuditAction,
    resource: string,
    resourceId: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      const log = this.auditLogRepository.create({
        userId,
        action,
        resource,
        resourceId,
        details,
        ipAddress,
        userAgent,
      });
      await this.auditLogRepository.save(log);
    } catch (error) {
      // Audit logging must never break the action being audited.
      this.logger.error(`Failed to write audit log: ${error.message}`);
    }
  }

  /**
   * Create the first super admin if none exists.
   * Credentials come from DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD.
   * If no password is configured a random one is generated and logged ONCE.
   */
  async createDefaultAdmin() {
    const adminExists = await this.userRepository.findOne({
      where: { role: UserRole.SUPER_ADMIN },
    });

    if (adminExists) return;

    const email = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@haraka.rw').trim().toLowerCase();
    const configured = process.env.DEFAULT_ADMIN_PASSWORD;
    const password = configured && configured.length >= MIN_PASSWORD_LENGTH ? configured : randomBytes(12).toString('base64url');

    const admin = this.userRepository.create({
      email,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      fullName: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
      isActive: true,
    });

    await this.userRepository.save(admin);

    if (configured) {
      this.logger.warn(`Default super admin created: ${email} (password from DEFAULT_ADMIN_PASSWORD)`);
    } else {
      this.logger.warn(`Default super admin created: ${email} / ${password}`);
      this.logger.warn('Log in and change this password immediately (Staff page or POST /auth/change-password).');
    }
  }
}
