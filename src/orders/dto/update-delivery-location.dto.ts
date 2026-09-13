import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class UpdateDeliveryLocationDto {
  @IsNumber()
  @IsNotEmpty()
  deliveryLatitude: number;

  @IsNumber()
  @IsNotEmpty()
  deliveryLongitude: number;

  @IsString()
  @IsNotEmpty()
  deliveryAddress: string;
}
