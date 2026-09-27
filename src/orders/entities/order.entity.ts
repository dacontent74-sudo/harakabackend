import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('orders')
export class Order {
  @PrimaryColumn()
  id: string;

  // Sender Information
  @Column({ nullable: true })
  senderName: string;

  @Column({ nullable: true })
  senderPhone: string;

  @Column({ nullable: true })
  senderEmail: string;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  pickupLatitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  pickupLongitude: number;

  @Column({ nullable: true })
  pickupAddress: string;

  // Recipient Information
  @Column({ nullable: true })
  recipientName: string;

  @Column({ nullable: true })
  recipientPhone: string;

  @Column({ nullable: true })
  recipientEmail: string;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  deliveryLatitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  deliveryLongitude: number;

  @Column({ nullable: true })
  deliveryAddress: string;

  // Package Information
  @Column({ nullable: true })
  packageSize: string;

  @Column({ nullable: true })
  packageDescription: string;

  @Column({ nullable: true })
  vehicleType: string;

  // Delivery Details
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  distance: number;

  @Column({ type: 'json', nullable: true })
  pricing: any;

  @Column()
  status: string;

  @Column({ nullable: true })
  shareableLink: string;

  // Food Order Fields
  @Column({ nullable: true })
  restaurant: string; // Restaurant name for food orders

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total: number; // Top-level total amount

  @Column({ type: 'json', nullable: true })
  items: any; // Cart items for food orders

  @Column({ nullable: true })
  notes: string; // Delivery notes

  @Column({ nullable: true })
  paymentMethod: string; // Payment method chosen

  @Column({ nullable: true })
  paymentStatus: string; // pending, paid, failed

  @Column({ nullable: true })
  depositId: string; // PawaPay deposit ID

  @Column({ default: false })
  receiverPaysOnDelivery: boolean; // If true, courier collects payment from receiver

  // Courier Fields
  @Column({ nullable: true })
  courierId: number;

  @Column({ nullable: true })
  courierName: string;

  @Column({ nullable: true })
  courierPhone: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  courierLatitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  courierLongitude: number;

  @Column({ nullable: true })
  orderType: string; // 'food' or 'parcel'

  @Column({ nullable: true })
  restaurantName: string;

  @Column({ nullable: true })
  parcelDescription: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  deliveryFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  amount: number;

  @Column({ nullable: true })
  customerPhone: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Order Lifecycle Timestamps for Analytics & SLA Tracking
  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date; // When restaurant/system confirmed order

  @Column({ type: 'timestamp', nullable: true })
  preparingAt: Date; // When restaurant started preparing

  @Column({ type: 'timestamp', nullable: true })
  readyAt: Date; // When food/parcel marked ready for pickup

  @Column({ type: 'timestamp', nullable: true })
  assignedAt: Date; // When courier accepted the job

  @Column({ type: 'timestamp', nullable: true })
  pickedUpAt: Date; // When courier picked up from restaurant/sender

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date; // When order was delivered to customer

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date; // If order was cancelled

  @Column({ type: 'timestamp', nullable: true })
  estimatedDeliveryTime: Date; // Expected delivery time shown to customer
}
