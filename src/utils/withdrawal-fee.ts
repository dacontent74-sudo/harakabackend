/**
 * Platform fee charged on restaurant withdrawals (added 2026-10-14).
 *
 * The restaurant requests an amount; Haraka keeps 8% of it and pays out the rest.
 * The full requested amount is deducted from the restaurant balance.
 *
 * Amounts are whole RWF. The fee is rounded to the nearest franc and the net
 * amount is derived from it, so amount === platformFee + netAmount always holds.
 */
export const WITHDRAWAL_FEE_PERCENTAGE = 0.08;

export interface WithdrawalFeeBreakdown {
  amount: number;
  platformFee: number;
  netAmount: number;
  feePercentage: number;
}

export function calculateWithdrawalFee(amount: number): WithdrawalFeeBreakdown {
  const gross = Math.round(Number(amount));
  if (!Number.isFinite(gross) || gross <= 0) {
    return { amount: 0, platformFee: 0, netAmount: 0, feePercentage: WITHDRAWAL_FEE_PERCENTAGE };
  }
  const platformFee = Math.round(gross * WITHDRAWAL_FEE_PERCENTAGE);
  return { amount: gross, platformFee, netAmount: gross - platformFee, feePercentage: WITHDRAWAL_FEE_PERCENTAGE };
}

/**
 * Amount actually sent to the restaurant for a stored withdrawal.
 * Withdrawals created before the fee existed have no netAmount and are paid in full.
 */
export function payoutAmountOf(w: { amount: number | string; netAmount?: number | string | null }): number {
  if (w.netAmount !== null && w.netAmount !== undefined && w.netAmount !== '') {
    return parseFloat(w.netAmount.toString());
  }
  return parseFloat(w.amount.toString());
}
