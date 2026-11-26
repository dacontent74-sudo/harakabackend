import { Controller, Delete, Get, HttpCode, MessageEvent, Param, ParseIntPipe, Post, Query, Sse } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { Auth } from '../auth/decorators/roles.decorator';
import { STAFF_ALL } from '../auth/principal';
import { AdminNotificationService } from './admin-notification.service';

/**
 * Admin dashboard notifications (any staff JWT, sent as `Authorization: Bearer`).
 *
 *   GET    /api/v1/admin/notifications/stream       Server-Sent Events: ready | notification | update | ping
 *   GET    /api/v1/admin/notifications              ?limit=50&unread=true&before=<id>  -> { data, hasMore, unreadCount }
 *   GET    /api/v1/admin/notifications/unread-count
 *   POST   /api/v1/admin/notifications/:id/read
 *   POST   /api/v1/admin/notifications/:id/unread
 *   POST   /api/v1/admin/notifications/read-all
 *   DELETE /api/v1/admin/notifications/:id
 *   DELETE /api/v1/admin/notifications              clear all
 *
 * The dashboard opens the stream with fetch() (not EventSource) so the JWT goes in
 * the Authorization header instead of the URL, where it would end up in logs.
 */
@Controller('admin/notifications')
@Auth(...STAFF_ALL)
export class AdminNotificationsController {
  constructor(private readonly notifications: AdminNotificationService) {}

  @Sse('stream')
  @SkipThrottle()
  stream(): Observable<MessageEvent> {
    return this.notifications.stream();
  }

  @Get()
  async list(@Query('limit') limit?: string, @Query('unread') unread?: string, @Query('before') before?: string) {
    const page = await this.notifications.list({
      limit: Number(limit) || 50,
      unreadOnly: unread === 'true' || unread === '1',
      beforeId: Number(before) || undefined,
    });
    return { success: true, ...page };
  }

  @Get('unread-count')
  async unreadCount() {
    return { success: true, unreadCount: await this.notifications.unreadCount() };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll() {
    return { success: true, ...(await this.notifications.markAllRead()) };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@Param('id', ParseIntPipe) id: number) {
    return { success: true, ...(await this.notifications.setRead(id, true)) };
  }

  @Post(':id/unread')
  @HttpCode(200)
  async unread(@Param('id', ParseIntPipe) id: number) {
    return { success: true, ...(await this.notifications.setRead(id, false)) };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return { success: true, ...(await this.notifications.remove(id)) };
  }

  @Delete()
  async clear() {
    return { success: true, ...(await this.notifications.clearAll()) };
  }
}
