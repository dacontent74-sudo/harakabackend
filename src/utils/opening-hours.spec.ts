import { isOpenAt } from './opening-hours';

describe('isOpenAt', () => {
  const hours = { monday: { open: '08:00', close: '22:00' } };
  // 2026-10-12 is a Monday.
  const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m);

  it('is open inside opening hours', () => {
    expect(isOpenAt(hours, at(8))).toBe(true);
    expect(isOpenAt(hours, at(21, 59))).toBe(true);
  });

  it('is closed outside opening hours (close time is exclusive)', () => {
    expect(isOpenAt(hours, at(7, 59))).toBe(false);
    expect(isOpenAt(hours, at(22))).toBe(false);
  });

  it('is closed on days without hours and when hours are missing/invalid', () => {
    expect(isOpenAt(hours, new Date(2026, 9, 13, 12))).toBe(false); // Tuesday
    expect(isOpenAt(null, at(12))).toBe(false);
    expect(isOpenAt({ monday: { open: 'x', close: 'y' } }, at(12))).toBe(false);
  });
});
