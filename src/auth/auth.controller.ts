import { Controller, Post, Get, Put, Delete, Body, Param, Query, Ip, ParseIntPipe, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Auth, CurrentUser } from './decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { AuthPrincipal, STAFF_ADMIN } from './principal';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Staff (admin dashboard) login. Rate limited: 5 attempts / minute / IP. */
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() body: { email: string; password: string }, @Ip() ip: string) {
    return this.authService.login(body?.email, body?.password, ip);
  }

  @Post('register')
  @Auth(...STAFF_ADMIN)
  async register(@Body() body: any, @CurrentUser() user: AuthPrincipal) {
    return this.authService.register(body, { id: user.id, role: user.role });
  }

  @Get('me')
  @Auth(...Object.values(UserRole))
  async getMe(@CurrentUser() user: AuthPrincipal) {
    return this.authService.getMe(user.id);
  }

  @Post('change-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Auth(...Object.values(UserRole))
  async changePassword(
    @Body() body: { currentPassword: string; newPassword: string },
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.authService.changeOwnPassword(user.id, body?.currentPassword, body?.newPassword);
  }

  @Get('users')
  @Auth(...STAFF_ADMIN)
  async getAllUsers() {
    return {
      success: true,
      data: await this.authService.getAllUsers(),
    };
  }

  @Put('users/:id')
  @Auth(UserRole.SUPER_ADMIN)
  async updateUser(@Param('id', ParseIntPipe) id: number, @Body() body: any, @CurrentUser() user: AuthPrincipal) {
    return this.authService.updateUser(id, body || {}, user.id);
  }

  @Delete('users/:id')
  @Auth(UserRole.SUPER_ADMIN)
  async deleteUser(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.authService.deleteUser(id, user.id);
  }

  @Get('audit-logs')
  @Auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async getAuditLogs(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return {
      success: true,
      data: await this.authService.getAuditLogs(limit ? parseInt(limit, 10) : 100, offset ? parseInt(offset, 10) : 0),
    };
  }
}
