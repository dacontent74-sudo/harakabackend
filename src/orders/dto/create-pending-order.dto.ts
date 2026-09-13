import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

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
}
