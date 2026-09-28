import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { AuditLog, AuditAction } from './entities/audit-log.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string, ipAddress?: string) {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    user.lastLoginAt = new Date();
    user.lastLoginIp = ipAddress;
    await this.userRepository.save(user);

    // Log login activity
    await this.logActivity(user.id, AuditAction.LOGIN, 'user', user.id.toString(), { email }, ipAddress);

    // Generate JWT token
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };

    const token = this.jwtService.sign(payload);

    this.logger.log(`User logged in: ${email}`);

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

  async register(data: {
    email: string;
    password: string;
    fullName: string;
    role?: UserRole;
    phoneNumber?: string;
    createdBy?: number;
  }) {
    // Check if user exists
    const existingUser = await this.userRepository.findOne({
      where: { email: data.email }
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // Create user
    const user = this.userRepository.create({
      email: data.email,
      password: hashedPassword,
      fullName: data.fullName,
      role: data.role || UserRole.VIEWER,
      phoneNumber: data.phoneNumber,
      createdBy: data.createdBy,
      isActive: true,
    });

    const savedUser = await this.userRepository.save(user);

    // Log registration
    if (data.createdBy) {
      await this.logActivity(
        data.createdBy,
        AuditAction.CREATE,
        'user',
        savedUser.id.toString(),
        { email: data.email, role: data.role },
      );
    }

    this.logger.log(`New user registered: ${data.email} with role ${data.role}`);

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

  async validateToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userRepository.findOne({
        where: { id: payload.sub }
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid token');
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
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

    return users.map(user => ({
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

  async updateUser(userId: number, data: Partial<User>, updatedBy: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // If password is being updated, hash it
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    Object.assign(user, data);
    const updated = await this.userRepository.save(user);

    // Log update
    await this.logActivity(
      updatedBy,
      AuditAction.UPDATE,
      'user',
      userId.toString(),
      { updatedFields: Object.keys(data) },
    );

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

  async deleteUser(userId: number, deletedBy: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Soft delete - deactivate instead of removing
    user.isActive = false;
    await this.userRepository.save(user);

    // Log deletion
    await this.logActivity(
      deletedBy,
      AuditAction.DELETE,
      'user',
      userId.toString(),
      { email: user.email },
    );

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
      take: limit,
      skip: offset,
    });

    return logs.map(log => ({
      id: log.id,
      user: log.user ? {
        id: log.user.id,
        email: log.user.email,
        fullName: log.user.fullName,
      } : null,
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
  }

  // Create default super admin if none exists
  async createDefaultAdmin() {
    const adminExists = await this.userRepository.findOne({
      where: { role: UserRole.SUPER_ADMIN },
    });

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);

      const admin = this.userRepository.create({
        email: 'admin@haraka.rw',
        password: hashedPassword,
        fullName: 'Super Admin',
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      });

      await this.userRepository.save(admin);

      this.logger.warn('⚠️  DEFAULT ADMIN CREATED: admin@haraka.rw / admin123');
      this.logger.warn('⚠️  PLEASE CHANGE PASSWORD IMMEDIATELY!');
    }
  }
}
