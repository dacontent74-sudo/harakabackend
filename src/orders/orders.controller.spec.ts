import { ForbiddenException } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { StatusValidationService } from './services/status-validation.service';

/** Restaurant-side order status rules (money + ownership + races). */
describe('OrdersController.updateOrderStatus (restaurant)', () => {
  const merchant = { type: 'merchant', id: 7, role: 'merchant', name: 'Chez Lando' } as any;

  function setup(order: any, applied = true) {
    let stored = { ...order };
    const ordersService: any = {
      getOrderById: jest.fn(async () => ({ ...stored })),
      transitionStatus: jest.fn(async (_id: string, from: string, fields: any) => {
        if (!applied || stored.status !== from) return false;
        stored = { ...stored, ...fields };
        return true;
      }),
    };
    const smsCancelled = jest.fn(async () => true);
    const ok = () => jest.fn(async () => true);
    const sms: any = {
      sendOrderConfirmed: ok(), sendOrderPreparing: ok(), sendCourierAssigned: ok(), sendCourierArrivedAtPickup: ok(),
      sendOrderReady: ok(), sendOrderPickedUp: ok(), sendOrderDelivered: ok(), sendOrderCancelled: smsCancelled,
    };
    const ctrl = new OrdersController(ordersService, new StatusValidationService(), sms);
    return { ctrl, ordersService, smsCancelled, get stored() { return stored; } };
  }

  const paidOrder = {
    id: 'HRK1760000000000ABCDEFGH', orderType: 'food', merchantId: 7, restaurantName: 'Chez Lando',
    status: 'confirmed', paymentStatus: 'paid', senderPhone: '+250788000000', total: 5100,
  };

  it('accepts (starts preparing) a paid order of its own restaurant', async () => {
    const t = setup(paidOrder);
    const res: any = await t.ctrl.updateOrderStatus(paidOrder.id, { status: 'preparing' }, merchant);
    expect(res.success).toBe(true);
    expect(t.stored.status).toBe('preparing');
    expect(t.stored.preparingAt).toBeInstanceOf(Date);
  });

  it('refuses to prepare an UNPAID order', async () => {
    const t = setup({ ...paidOrder, status: 'pending', paymentStatus: 'pending' });
    const res: any = await t.ctrl.updateOrderStatus(paidOrder.id, { status: 'confirmed' }, merchant);
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not paid/);
    expect(t.ordersService.transitionStatus).not.toHaveBeenCalled();
  });

  it('forbids touching another restaurant\'s order (by merchantId, even with same name)', async () => {
    const t = setup({ ...paidOrder, merchantId: 99 });
    await expect(t.ctrl.updateOrderStatus(paidOrder.id, { status: 'preparing' }, merchant)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('matches legacy orders without merchantId by restaurant name', async () => {
    const t = setup({ ...paidOrder, merchantId: null });
    const res: any = await t.ctrl.updateOrderStatus(paidOrder.id, { status: 'preparing' }, merchant);
    expect(res.success).toBe(true);
  });

  it('forbids restaurants from setting courier statuses', async () => {
    const t = setup({ ...paidOrder, status: 'ready' });
    await expect(t.ctrl.updateOrderStatus(paidOrder.id, { status: 'delivered' }, merchant)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires a reason to reject', async () => {
    const t = setup(paidOrder);
    const res: any = await t.ctrl.updateOrderStatus(paidOrder.id, { status: 'cancelled' }, merchant);
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/reason/);
  });

  it('rejects with reason, records it and tells the customer about the refund', async () => {
    const t = setup(paidOrder);
    const res: any = await t.ctrl.updateOrderStatus(paidOrder.id, { status: 'cancelled', reason: 'Item out of stock' }, merchant);
    expect(res.success).toBe(true);
    expect(t.stored.cancellationReason).toBe('Item out of stock');
    expect(t.stored.cancelledBy).toBe('restaurant');
    expect(t.smsCancelled).toHaveBeenCalledWith('+250788000000', expect.any(String), 'Chez Lando', 'Item out of stock', true);
  });

  it('cannot cancel once the food is ready for the courier', async () => {
    const t = setup({ ...paidOrder, status: 'ready' });
    await expect(
      t.ctrl.updateOrderStatus(paidOrder.id, { status: 'cancelled', reason: 'changed mind' }, merchant),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('a double tap is a no-op (no second write, no second SMS)', async () => {
    const t = setup({ ...paidOrder, status: 'preparing' });
    const res: any = await t.ctrl.updateOrderStatus(paidOrder.id, { status: 'preparing' }, merchant);
    expect(res.success).toBe(true);
    expect(res.unchanged).toBe(true);
    expect(t.ordersService.transitionStatus).not.toHaveBeenCalled();
  });

  it('reports a conflict when another device changed the order first', async () => {
    const t = setup(paidOrder, false);
    const res: any = await t.ctrl.updateOrderStatus(paidOrder.id, { status: 'preparing' }, merchant);
    expect(res.success).toBe(false);
    expect(res.code).toBe('STATUS_CHANGED');
  });

  it('cannot skip steps (confirmed -> ready)', async () => {
    const t = setup(paidOrder);
    const res: any = await t.ctrl.updateOrderStatus(paidOrder.id, { status: 'ready' }, merchant);
    expect(res.success).toBe(false);
  });
});

describe('OrdersService.belongsToRestaurant', () => {
  it('never matches parcel orders', () => {
    expect(OrdersService.belongsToRestaurant({ orderType: 'parcel', merchantId: 7 } as any, 7, 'X')).toBe(false);
  });
});
