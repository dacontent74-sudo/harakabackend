import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type WithdrawalStatus = 'requested' | 'processing' | 'paid' | 'rejected' | 'failed';

/**
 * A restaurant's request to withdraw its earnings.
 * Requests are reviewed by an admin, who either pays them out through
 * PawaPay (status -> processing -> paid) or rejects them.
 * Requested/processing/paid withdrawals reduce the available balance.
 * Since 2026-10-14 Haraka keeps an 8% platform fee; only netAmount is paid out.
 */
@Entity('withdrawals')
export class Withdrawal {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  merchantId: number;

  @Column()
  restaurantName: string;

  /** Amount requested; this full amount is deducted from the restaurant balance. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  /** Haraka platform fee (8% of amount). Null on withdrawals made before the fee existed. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  platformFee: number;

  /** What the restaurant receives: amount - platformFee. Null on legacy withdrawals (paid in full). */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  netAmount: number;

  @Column()
  phoneNumber: string;

  @Column({ default: 'requested' })
  status: WithdrawalStatus;

  @Column({ nullable: true })
  payoutId: string; // PawaPay payoutId

  @Column({ nullable: true })
  reference: string; // Manual payment reference (if paid outside PawaPay)

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ nullable: true })
  processedBy: number; // staff user id

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
