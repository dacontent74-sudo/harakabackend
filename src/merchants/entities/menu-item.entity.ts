import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Merchant } from './merchant.entity';

@Entity('menu_items')
export class MenuItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  merchantId: number;

  @ManyToOne(() => Merchant, merchant => merchant.menuItems)
  @JoinColumn({ name: 'merchantId' })
  merchant: Merchant;

  @Column()
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column()
  category: string; // e.g., "Coffee", "Main Course", "Dessert"

  @Column({ nullable: true })
  image: string; // URL to menu item image

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isAvailable: boolean; // Can mark items as out of stock

  @Column({ default: false })
  isPopular: boolean; // Featured/popular items

  @Column({ default: false })
  isVegetarian: boolean;

  @Column({ default: false })
  isVegan: boolean;

  @Column({ default: false })
  isSpicy: boolean;

  @Column({ type: 'int', nullable: true })
  preparationTime: number; // minutes

  @Column({ type: 'simple-array', nullable: true })
  allergens: string[]; // e.g., ['nuts', 'dairy', 'gluten']

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
