import { IsString, IsNumber, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreatePendingOrderDto {
  // Sender
  @IsString()
  @IsNotEmpty()
  senderName: string;

  @IsString()
  @IsNotEmpty()
  senderPhone: string;

  @IsNumber()
  @IsNotEmpty()
  pickupLatitude: number;

  @IsNumber()
  @IsNotEmpty()
  pickupLongitude: number;

  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  // Recipient
  @IsString()
  @IsNotEmpty()
  recipientName: string;

  @IsString()
  @IsNotEmpty()
  recipientPhone: string;

  // Package
  @IsString()
  @IsNotEmpty()
  packageSize: string;

  @IsString()
  @IsNotEmpty()
  packageDescription: string;

  @IsString()
  @IsNotEmpty()
  vehicleType: string;

  // Payment (optional)
  @IsOptional()
  @IsString()
  paymentPayer?: string; // 'sender' or 'receiver'

  @IsOptional()
  @IsBoolean()
  receiverPaysOnDelivery?: boolean;
}
