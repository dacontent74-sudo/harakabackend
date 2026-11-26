import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AdminNotificationType = 'new_order' | 'payment' | 'cancellation' | 'withdrawal' | 'system';

/** One alert shown in the admin dashboard's notification bell (replaces admin SMS/email). */
@Entity('admin_notifications')
export class AdminNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  type: AdminNotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column('text')
  message: string;

  @Column('jsonb', { nullable: true })
  data: Record<string, unknown> | null;

  @Index()
  @Column({ default: false })
  read: boolean;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
