import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { MenuItem } from './menu-item.entity';

@Entity('merchants')
export class Merchant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 4.5 })
  rating: number;

  @Column({ nullable: true })
  deliveryTime: string; // e.g., "15-25 min"

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  deliveryFee: number;

  @Column({ type: 'int', default: 15 })
  prepTime: number; // minutes to prepare food

  @Column({ nullable: true })
  image: string; // URL to restaurant image

  @Column({ type: 'simple-array', nullable: true })
  cuisine: string[]; // e.g., ['Coffee', 'Pastries', 'Breakfast']

  @Column({ nullable: true })
  location: string; // e.g., "Kimihurura, Kigali"

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  @Column({ type: 'json', nullable: true })
  hours: any; // Operating hours for each day

  @Column({ default: true })
  isActive: boolean; // Can be deactivated without deleting

  @Column({ default: false })
  isVerified: boolean; // Verified restaurant

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  locationToken: string; // Token for location confirmation link

  @Column({ type: 'timestamp', nullable: true })
  locationTokenExpiry: Date; // Token expiration time

  @Column({ default: false })
  locationConfirmed: boolean; // Whether location has been confirmed via link

  // bcrypt hash of the restaurant app password (set by an admin). Never selected by default.
  @Column({ nullable: true, select: false })
  passwordHash: string;

  @OneToMany(() => MenuItem, menuItem => menuItem.merchant)
  menuItems: MenuItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
