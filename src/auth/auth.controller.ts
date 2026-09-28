import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards, Request, Ip } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { UserRole } from './entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Ip() ip: string) {
    return this.authService.login(body.email, body.password, ip);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async register(@Body() body: any, @Request() req: any) {
    return this.authService.register({
      ...body,
      createdBy: req.user.id,
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: any) {
    return this.authService.getMe(req.user.id);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async getAllUsers() {
    return {
      success: true,
      data: await this.authService.getAllUsers(),
    };
  }

  @Put('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async updateUser(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    return this.authService.updateUser(parseInt(id), body, req.user.id);
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async deleteUser(@Param('id') id: string, @Request() req: any) {
    return this.authService.deleteUser(parseInt(id), req.user.id);
  }

  @Get('audit-logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async getAuditLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return {
      success: true,
      data: await this.authService.getAuditLogs(
        limit ? parseInt(limit) : 100,
        offset ? parseInt(offset) : 0,
      ),
    };
  }
}
