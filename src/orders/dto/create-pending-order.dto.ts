export class CreatePendingOrderDto {
  // Sender
  senderName: string;
  senderPhone: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupAddress: string;

  // Recipient
  recipientName: string;
  recipientPhone: string;

  // Package
  packageSize: string;
  packageDescription: string;
  vehicleType: string;
}
