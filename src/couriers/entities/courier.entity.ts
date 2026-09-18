import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('couriers')
export class Courier {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  phoneNumber: string;

  @Column()
  password: string;

  @Column({ default: 'motorcycle' })
  vehicleType: string;

  @Column()
  vehicleNumber: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 5.0 })
  rating: number;

  @Column({ default: 0 })
  totalDeliveries: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalEarnings: number;

  @Column({ default: 'offline' })
  status: string; // offline, online, busy

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  currentLatitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  currentLongitude: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
