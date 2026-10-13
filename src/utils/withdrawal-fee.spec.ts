import { calculateWithdrawalFee, payoutAmountOf, WITHDRAWAL_FEE_PERCENTAGE } from './withdrawal-fee';

describe('calculateWithdrawalFee', () => {
  it('is 8%', () => {
    expect(WITHDRAWAL_FEE_PERCENTAGE).toBe(0.08);
  });

  it.each([
    [1000, 80, 920],
    [100, 8, 92],
    [250, 20, 230],
    [5000, 400, 4600],
    [12345, 988, 11357], // 987.6 -> 988
    [101, 8, 93], // 8.08 -> 8
    [106, 8, 98], // 8.48 -> 8
    [107, 9, 98], // 8.56 -> 9
    [1000000, 80000, 920000],
  ])('%d RWF -> fee %d, net %d', (amount, fee, net) => {
    const r = calculateWithdrawalFee(amount);
    expect(r.amount).toBe(amount);
    expect(r.platformFee).toBe(fee);
    expect(r.netAmount).toBe(net);
    expect(r.platformFee + r.netAmount).toBe(r.amount);
  });

  it('rounds a fractional request to whole RWF first', () => {
    expect(calculateWithdrawalFee(999.6)).toMatchObject({ amount: 1000, platformFee: 80, netAmount: 920 });
  });

  it('handles invalid input', () => {
    expect(calculateWithdrawalFee(NaN)).toMatchObject({ amount: 0, platformFee: 0, netAmount: 0 });
    expect(calculateWithdrawalFee(-50)).toMatchObject({ amount: 0, platformFee: 0, netAmount: 0 });
  });

  it('fee + net always equals the amount', () => {
    for (let a = 100; a <= 20000; a += 7) {
      const r = calculateWithdrawalFee(a);
      expect(r.platformFee + r.netAmount).toBe(a);
      expect(Math.abs(r.platformFee - a * 0.08)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('payoutAmountOf', () => {
  it('pays the net amount when present (decimal columns come back as strings)', () => {
    expect(payoutAmountOf({ amount: '1000.00', netAmount: '920.00' })).toBe(920);
  });

  it('pays legacy withdrawals (no fee) in full', () => {
    expect(payoutAmountOf({ amount: '1000.00', netAmount: null })).toBe(1000);
    expect(payoutAmountOf({ amount: 500 })).toBe(500);
  });
});
