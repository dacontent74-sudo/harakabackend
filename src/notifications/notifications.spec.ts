import { TwilioSmsService, toE164, maskPhone } from './twilio-sms.service';
import { AdminNotificationService } from './admin-notification.service';

const cfg = (env: Record<string, string | undefined>) => ({ get: (k: string) => env[k] }) as any;

describe('toE164', () => {
  it.each([
    ['0788123456', '+250788123456'],
    ['788123456', '+250788123456'],
    ['250788123456', '+250788123456'],
    ['+250 788 123 456', '+250788123456'],
    ['00250788123456', '+250788123456'],
    ['+19842301820', '+19842301820'],
  ])('%s -> %s', (input, out) => expect(toE164(input)).toBe(out));

  it.each(['', 'abc', '12345', '+12'])('rejects %p', (input) => expect(toE164(input)).toBeNull());

  it('masks phones', () => expect(maskPhone('+250788123456')).toBe('+250788***456'));
});

describe('TwilioSmsService', () => {
  const goodEnv = {
    TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32),
    TWILIO_AUTH_TOKEN: 'b'.repeat(32) + '  ', // trailing spaces must be trimmed
    TWILIO_PHONE_NUMBER: '+19842301820', // alias of TWILIO_FROM_NUMBER
  };

  function withClient(create: jest.Mock) {
    const svc = new TwilioSmsService(cfg(goodEnv));
    (svc as any).twilioClient = { messages: { create } };
    return svc;
  }

  it('accepts TWILIO_PHONE_NUMBER and valid-looking credentials', () => {
    const s = new TwilioSmsService(cfg(goodEnv)).getStatus();
    expect(s.configured).toBe(true);
    expect(s.fromNumber).toBe('+19842301820');
    expect(s.configProblem).toBeUndefined();
  });

  it('flags a truncated auth token', () => {
    const s = new TwilioSmsService(cfg({ ...goodEnv, TWILIO_AUTH_TOKEN: 'b'.repeat(31) })).getStatus();
    expect(s.configProblem).toMatch(/TWILIO_AUTH_TOKEN must be 32 hex chars \(got 31/);
  });

  it('reports missing configuration instead of silently failing', async () => {
    const svc = new TwilioSmsService(cfg({}));
    const r = await svc.send('0788123456', 'hi');
    expect(r).toMatchObject({ success: false, code: 'NOT_CONFIGURED' });
  });

  it('normalises the recipient to E.164 before calling Twilio', async () => {
    const create = jest.fn(async () => ({ sid: 'SM1', status: 'queued' }));
    const r = await withClient(create).send('0788123456', 'hello');
    expect(r.success).toBe(true);
    expect(create).toHaveBeenCalledWith({ body: 'hello', to: '+250788123456', from: '+19842301820' });
  });

  it('explains the trial-account error (21608) and notifies listeners', async () => {
    const err: any = Object.assign(new Error('The number is unverified'), { code: 21608, status: 400 });
    const svc = withClient(jest.fn(async () => { throw err; }));
    const listener = jest.fn();
    svc.onFailure(listener);
    const r = await svc.send('+250788123456', 'x');
    expect(r).toMatchObject({ success: false, code: 21608 });
    expect(r.hint).toMatch(/TRIAL/);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ code: 21608, to: '+250788123456' }));
    expect(svc.getStatus().failed).toBe(1);
  });

  it('explains an authentication error (20003)', async () => {
    const err: any = Object.assign(new Error('Authenticate'), { code: 20003, status: 401 });
    const r = await withClient(jest.fn(async () => { throw err; })).send('+250788123456', 'x');
    expect(r.hint).toMatch(/TWILIO_AUTH_TOKEN/);
  });
});

describe('AdminNotificationService', () => {
  /** Minimal in-memory stand-in for Repository<AdminNotification>. */
  function fakeRepo() {
    let rows: any[] = [];
    let nextId = 1;
    const match = (r: any, where: any) => Object.entries(where).every(([k, v]) => r[k] === v);
    return {
      rows: () => rows,
      failSave: false,
      create: (x: any) => ({ ...x }),
      async save(this: any, x: any) {
        if (this.failSave) throw new Error('db down');
        const row = { ...x, id: nextId++, createdAt: new Date() };
        rows.push(row);
        return row;
      },
      count: async ({ where }: any) => rows.filter((r) => match(r, where)).length,
      update: async (where: any, patch: any) => {
        const hit = rows.filter((r) => match(r, where));
        hit.forEach((r) => Object.assign(r, patch));
        return { affected: hit.length };
      },
      delete: async (where: any) => {
        const before = rows.length;
        rows = rows.filter((r) => !match(r, where));
        return { affected: before - rows.length };
      },
      clear: async () => {
        rows = [];
      },
    };
  }

  const open: { unsubscribe(): void }[] = [];
  afterEach(() => open.splice(0).forEach((s) => s.unsubscribe()));

  function setup() {
    let failureListener: (f: any) => void = () => undefined;
    const sms: any = { send: jest.fn(), onFailure: (l: any) => (failureListener = l) };
    const repo = fakeRepo();
    const svc = new AdminNotificationService(repo as any, sms);
    const events: any[] = [];
    const sub = svc.stream().subscribe((e) => events.push(e));
    open.push(sub);
    return { svc, sms, repo, events, sub, fail: (f: any) => failureListener(f) };
  }

  const order = { id: 'HRK1760000000000ABCDEFGH', orderType: 'food', restaurantName: 'Chez Lando', total: 5100, senderPhone: '+250788000000', paymentMethod: 'mtn_momo' };
  const pushed = (events: any[]) => events.filter((e) => e.type === 'notification').map((e) => e.data);

  it('stores a new order and pushes it to live dashboards (never SMS)', async () => {
    const t = setup();
    expect(t.events[0].type).toBe('ready');
    const n = await t.svc.orderCreated(order);
    expect(n).toMatchObject({ id: 1, type: 'new_order', read: false });
    expect(n.message).toContain('Chez Lando');
    expect(n.data).toMatchObject({ restaurantName: 'Chez Lando', total: 5100, shortId: 'HRK17600' });
    expect(pushed(t.events)).toEqual([n]);
    expect(t.repo.rows()).toHaveLength(1);
    expect(t.sms.send).not.toHaveBeenCalled();
    t.sub.unsubscribe();
  });

  it('includes amount and payment method for payments', async () => {
    const t = setup();
    const n = await t.svc.orderPaid(order);
    expect(n.type).toBe('payment');
    expect(n.data).toMatchObject({ amount: 5100, paymentMethod: 'mtn_momo' });
    expect(n.message).toContain('mtn momo');
  });

  it('flags cancelled paid orders as needing a refund', async () => {
    const t = setup();
    const n = await t.svc.orderCancelled({ ...order, paymentStatus: 'paid' }, 'Out of stock', 'restaurant');
    expect(n.type).toBe('cancellation');
    expect(n.title).toMatch(/refund needed/i);
    expect(n.data).toMatchObject({ refundNeeded: true, reason: 'Out of stock' });
  });

  it('reports withdrawals with restaurant, amount and phone', async () => {
    const t = setup();
    const n = await t.svc.withdrawalRequested({ id: 7, restaurantName: 'Chez Lando', amount: 1000, netAmount: 920, phoneNumber: '+250788000000' });
    expect(n).toMatchObject({ type: 'withdrawal', data: { withdrawalId: 7, amount: 1000, netAmount: 920, phoneNumber: '+250788000000' } });
  });

  it('raises one system alert per SMS error code (deduplicated)', async () => {
    const t = setup();
    t.fail({ to: '+250788999999', code: 21608, error: 'unverified', at: new Date() });
    t.fail({ to: '+250788999998', code: 21608, error: 'unverified', at: new Date() });
    t.fail({ to: '+250788999997', code: 20003, error: 'auth', at: new Date() });
    await new Promise((r) => setImmediate(r));
    const sys = pushed(t.events);
    expect(sys).toHaveLength(2);
    expect(sys.every((n) => n.type === 'system' && n.data.level === 'error')).toBe(true);
    expect(sys[0].message).toContain('+250788***999');
  });

  it('still pushes live when the database write fails', async () => {
    const t = setup();
    (t.repo as any).failSave = true;
    const n = await t.svc.orderPaid(order);
    expect(n.id).toBeLessThan(0);
    expect(pushed(t.events)).toHaveLength(1);
  });

  it('marks read/unread, read-all, delete and clear, broadcasting unread counts', async () => {
    const t = setup();
    const a = await t.svc.orderCreated(order);
    const b = await t.svc.orderPaid(order);
    expect(await t.svc.setRead(a.id, true)).toEqual({ unreadCount: 1 });
    expect(await t.svc.setRead(a.id, false)).toEqual({ unreadCount: 2 });
    expect(await t.svc.markAllRead()).toEqual({ unreadCount: 0 });
    expect(await t.svc.remove(b.id)).toEqual({ unreadCount: 0 });
    await expect(t.svc.remove(999)).rejects.toThrow('Notification not found');
    await t.svc.clearAll();
    expect(t.repo.rows()).toHaveLength(0);
    const updates = t.events.filter((e) => e.type === 'update').map((e) => e.data.action);
    expect(updates).toEqual(['read', 'unread', 'read_all', 'delete', 'clear']);
  });
});
