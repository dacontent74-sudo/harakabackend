import { NotFoundException } from '@nestjs/common';
import { MerchantsService } from './merchants.service';

/** A restaurant may only change availability of its OWN menu items. */
describe('MerchantsService.setMenuItemAvailability', () => {
  function service(item: any) {
    const menuRepo: any = {
      findOne: jest.fn(async () => item),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    const svc = new MerchantsService({} as any, {} as any, menuRepo, {} as any, {} as any, {} as any, {} as any);
    return { svc, menuRepo };
  }

  it('updates own item', async () => {
    const { svc, menuRepo } = service({ id: 3, merchantId: 7 });
    await expect(svc.setMenuItemAvailability(7, 3, false)).resolves.toEqual({ id: '3', isAvailable: false });
    expect(menuRepo.update).toHaveBeenCalledWith({ id: 3 }, { isAvailable: false });
  });

  it('refuses another restaurant\'s item (and does not reveal it exists)', async () => {
    const { svc, menuRepo } = service({ id: 3, merchantId: 8 });
    await expect(svc.setMenuItemAvailability(7, 3, false)).rejects.toBeInstanceOf(NotFoundException);
    expect(menuRepo.update).not.toHaveBeenCalled();
  });

  it('rejects non-boolean values', async () => {
    const { svc } = service({ id: 3, merchantId: 7 });
    await expect(svc.setMenuItemAvailability(7, 3, 'no' as any)).rejects.toThrow();
  });
});
