import { Injectable, Logger, MessageEvent, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Observable, Subject, interval, map, merge, of, takeUntil, timer } from 'rxjs';
import { SmsFailure, TwilioSmsService, maskPhone } from './twilio-sms.service';
import { AdminNotification, AdminNotificationType } from './entities/admin-notification.entity';

export type SystemLevel = 'error' | 'warning' | 'info';

/** Events pushed over the SSE stream (`event:` field). */
export type AdminStreamEvent =
  | { type: 'notification'; data: AdminNotificationDto }
  | { type: 'update'; data: { action: 'read' | 'unread' | 'read_all' | 'delete' | 'clear'; id?: number; unreadCount: number } };

export interface AdminNotificationDto {
  id: number;
  type: AdminNotificationType;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

/** At most one alert per (key) in this window for noisy system events. */
const SYSTEM_ALERT_WINDOW_MS = 30 * 60 * 1000;
/** SSE keep-alive so proxies (Render, Vercel, browsers) don't drop an idle stream. */
const HEARTBEAT_MS = 25 * 1000;
const PRUNE_EVERY_MS = 15 * 60 * 1000;
/** Longest life of one SSE connection before the client is made to reconnect (and re-authenticate). */
const MAX_CONNECTION_MS = 30 * 60 * 1000;

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Real-time alerts for the Haraka operations team, shown in the admin dashboard
 * (notification bell + toast). Admins no longer get SMS or email: restaurants,
 * couriers and customers still get their SMS through TwilioSmsService.
 *
 * Every alert is stored in `admin_notifications` and pushed to every open
 * dashboard over Server-Sent Events (GET /api/v1/admin/notifications/stream).
 * Retention: ADMIN_NOTIFICATIONS_RETENTION_DAYS (default 7) and at most
 * ADMIN_NOTIFICATIONS_MAX rows (default 100).
 *
 * All event methods are fire-and-forget safe: they never throw.
 */
@Injectable()
export class AdminNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminNotificationService.name);
  private readonly events$ = new Subject<AdminStreamEvent>();
  private readonly lastSystemAlert = new Map<string, number>();
  private readonly maxRows = intEnv('ADMIN_NOTIFICATIONS_MAX', 100);
  private readonly retentionDays = intEnv('ADMIN_NOTIFICATIONS_RETENTION_DAYS', 7);
  private pruneTimer?: NodeJS.Timeout;
  private transientId = 0;
  private subscribers = 0;

  constructor(
    @InjectRepository(AdminNotification)
    private readonly repo: Repository<AdminNotification>,
    @Optional() private readonly sms?: TwilioSmsService,
  ) {
    // Tell the admins in the dashboard when customer/restaurant SMS stops working.
    this.sms?.onFailure((f) => this.smsFailed(f));
  }

  onModuleInit() {
    void this.prune();
    this.pruneTimer = setInterval(() => void this.prune(), PRUNE_EVERY_MS);
    this.pruneTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.events$.complete();
  }

  // ------------------------------------------------------------------ stream

  /** SSE stream for one dashboard connection: a `ready` event, then notifications/updates and pings. */
  stream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      this.subscribers++;
      const sub = merge(
        of<MessageEvent>({ type: 'ready', data: { at: new Date().toISOString() }, retry: 5000 } as MessageEvent),
        this.events$.pipe(map((e): MessageEvent => ({ type: e.type, data: e.data, id: e.type === 'notification' ? String(e.data.id) : undefined }))),
        interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: { at: new Date().toISOString() } }))),
      )
        // End the stream periodically: the dashboard reconnects at once, and the reconnect
        // re-runs JWT validation, so revoked/expired sessions can't keep listening.
        .pipe(takeUntil(timer(MAX_CONNECTION_MS)))
        .subscribe(subscriber);
      return () => {
        this.subscribers--;
        sub.unsubscribe();
      };
    });
  }

  getConfig() {
    return {
      channel: 'dashboard',
      liveConnections: this.subscribers,
      maxStored: this.maxRows,
      retentionDays: this.retentionDays,
    };
  }

  // -------------------------------------------------------------------- REST

  async list(opts: { limit?: number; unreadOnly?: boolean; beforeId?: number } = {}) {
    const limit = Math.max(1, Math.min(Number(opts.limit) || 50, this.maxRows));
    const qb = this.repo.createQueryBuilder('n').orderBy('n.id', 'DESC').take(limit + 1);
    if (opts.unreadOnly) qb.andWhere('n.read = false');
    if (opts.beforeId) qb.andWhere('n.id < :beforeId', { beforeId: opts.beforeId });
    const rows = await qb.getMany();
    return {
      data: rows.slice(0, limit).map(toDto),
      hasMore: rows.length > limit,
      unreadCount: await this.unreadCount(),
    };
  }

  unreadCount() {
    return this.repo.count({ where: { read: false } });
  }

  async setRead(id: number, read: boolean) {
    const res = await this.repo.update({ id }, { read });
    if (!res.affected) throw new NotFoundException('Notification not found');
    const unreadCount = await this.unreadCount();
    this.events$.next({ type: 'update', data: { action: read ? 'read' : 'unread', id, unreadCount } });
    return { unreadCount };
  }

  async markAllRead() {
    await this.repo.update({ read: false }, { read: true });
    this.events$.next({ type: 'update', data: { action: 'read_all', unreadCount: 0 } });
    return { unreadCount: 0 };
  }

  async remove(id: number) {
    const res = await this.repo.delete({ id });
    if (!res.affected) throw new NotFoundException('Notification not found');
    const unreadCount = await this.unreadCount();
    this.events$.next({ type: 'update', data: { action: 'delete', id, unreadCount } });
    return { unreadCount };
  }

  async clearAll() {
    await this.repo.clear();
    this.events$.next({ type: 'update', data: { action: 'clear', unreadCount: 0 } });
    return { unreadCount: 0 };
  }

  // ------------------------------------------------------------------ events

  orderCreated(order: any) {
    const id = shortId(order);
    const isParcel = order?.orderType === 'parcel';
    const restaurantName = order?.restaurantName || order?.restaurant || null;
    const title = isParcel ? 'New parcel order' : 'New food order';
    const message = isParcel
      ? `Order #${id} - ${money(order?.total)} RWF${order?.receiverPaysOnDelivery ? ' (receiver pays on delivery)' : ''}`
      : `Order #${id} from ${restaurantName || 'restaurant'} - ${money(order?.total)} RWF, waiting for payment`;
    return this.dispatch('new_order', title, message, {
      orderId: order?.id ?? null,
      shortId: id,
      orderType: order?.orderType || 'food',
      restaurantName,
      total: money(order?.total),
      customerName: order?.senderName || null,
      customerPhone: order?.senderPhone || order?.customerPhone || null,
      itemCount: Array.isArray(order?.items) ? order.items.length : undefined,
      link: '/orders',
    });
  }

  orderPaid(order: any) {
    const id = shortId(order);
    const method = order?.paymentMethod || 'mobile_money';
    return this.dispatch('payment', 'Payment received', `Order #${id}: ${money(order?.total)} RWF via ${humanize(method)}${order?.restaurantName ? ` (${order.restaurantName})` : ''}`, {
      orderId: order?.id ?? null,
      shortId: id,
      amount: money(order?.total),
      paymentMethod: method,
      orderType: order?.orderType || 'food',
      restaurantName: order?.restaurantName || null,
      status: order?.status ?? null,
      link: '/orders',
    });
  }

  orderCancelled(order: any, reason: string | undefined, by: string) {
    const id = shortId(order);
    const refundNeeded = order?.paymentStatus === 'paid';
    const title = refundNeeded ? 'Order cancelled - refund needed' : 'Order cancelled';
    return this.dispatch('cancellation', title, `Order #${id} cancelled by ${by}${reason ? `: ${reason}` : ''} (${money(order?.total)} RWF)`, {
      orderId: order?.id ?? null,
      shortId: id,
      reason: reason || null,
      cancelledBy: by,
      refundNeeded,
      total: money(order?.total),
      paymentStatus: order?.paymentStatus || null,
      restaurantName: order?.restaurantName || order?.restaurant || null,
      customerPhone: order?.senderPhone || order?.customerPhone || null,
      link: '/orders',
    });
  }

  withdrawalRequested(w: { id: number | string; restaurantName?: string; amount: number; netAmount: number; phoneNumber: string }) {
    return this.dispatch(
      'withdrawal',
      'Withdrawal requested',
      `${w.restaurantName || 'A restaurant'} requested ${money(w.amount)} RWF (pay out ${money(w.netAmount)} RWF to ${w.phoneNumber})`,
      {
        withdrawalId: w.id,
        restaurantName: w.restaurantName || null,
        amount: money(w.amount),
        netAmount: money(w.netAmount),
        phoneNumber: w.phoneNumber,
        link: '/withdrawals',
      },
    );
  }

  /**
   * Errors and warnings for the ops team. With `dedupeKey`, repeats of the same
   * problem are muted for 30 minutes so a failing dependency can't flood the bell.
   */
  systemAlert(title: string, message: string, opts: { level?: SystemLevel; dedupeKey?: string; data?: Record<string, unknown> } = {}) {
    if (opts.dedupeKey) {
      const now = Date.now();
      if (now - (this.lastSystemAlert.get(opts.dedupeKey) ?? 0) < SYSTEM_ALERT_WINDOW_MS) return Promise.resolve(null);
      this.lastSystemAlert.set(opts.dedupeKey, now);
    }
    return this.dispatch('system', title, message, { level: opts.level || 'warning', ...(opts.data || {}) });
  }

  test(by?: string) {
    return this.dispatch('system', 'Test notification', `Dashboard notifications work${by ? ` (sent by ${by})` : ''}.`, { level: 'info', test: true });
  }

  private smsFailed(f: SmsFailure) {
    const key = String(f.code ?? 'unknown');
    void this.systemAlert(
      `SMS delivery failing (Twilio ${key})`,
      [`Last failed recipient: ${maskPhone(f.to)}.`, `Error: ${f.error}.`, f.hint ? `Fix: ${f.hint}` : '', `Further "${key}" failures are muted for 30 minutes.`]
        .filter(Boolean)
        .join(' '),
      { level: 'error', dedupeKey: `sms:${key}`, data: { source: 'twilio', code: f.code ?? null } },
    );
  }

  // ---------------------------------------------------------------- delivery

  private async dispatch(type: AdminNotificationType, title: string, message: string, data: Record<string, unknown>): Promise<AdminNotificationDto> {
    const clean = JSON.parse(JSON.stringify(data)) as Record<string, unknown>; // drop undefined
    let dto: AdminNotificationDto;
    try {
      const saved = await this.repo.save(this.repo.create({ type, title: title.slice(0, 255), message, data: clean, read: false }));
      dto = toDto(saved);
    } catch (error) {
      // Still push it live; it just won't survive a reload.
      this.logger.error(`❌ Could not store admin notification [${type}] ${title}: ${error?.message}`);
      dto = { id: -++this.transientId, type, title, message, data: clean, read: false, createdAt: new Date().toISOString() };
    }
    this.events$.next({ type: 'notification', data: dto });
    this.logger.log(`🔔 Admin notification [${type}] ${title} -> ${this.subscribers} live dashboard(s)`);
    return dto;
  }

  /** Delete notifications older than the retention window and keep at most `maxRows`. */
  async prune() {
    try {
      const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
      const old = await this.repo.delete({ createdAt: LessThan(cutoff) });
      const overflow = await this.repo
        .createQueryBuilder()
        .delete()
        .where(`id NOT IN (SELECT id FROM admin_notifications ORDER BY id DESC LIMIT :max)`, { max: this.maxRows })
        .execute();
      const removed = (old.affected ?? 0) + (overflow.affected ?? 0);
      if (removed) this.logger.log(`🧹 Pruned ${removed} old admin notification(s)`);
    } catch (error) {
      this.logger.warn(`Admin notification cleanup failed: ${error?.message}`);
    }
  }
}

function toDto(n: AdminNotification): AdminNotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    data: n.data ?? null,
    read: !!n.read,
    createdAt: (n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt ?? Date.now())).toISOString(),
  };
}

function shortId(order: any): string {
  return String(order?.id ?? '').substring(0, 8).toUpperCase();
}

function money(v: unknown): number {
  return Math.round(Number(v) || 0);
}

function humanize(v: string): string {
  return v.replace(/[_-]+/g, ' ');
}
