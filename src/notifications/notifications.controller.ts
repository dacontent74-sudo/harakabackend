import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  /**
   * Get WhatsApp QR code for scanning
   * GET /notifications/whatsapp/qr
   */
  @Get('whatsapp/qr')
  getQRCode() {
    const qrCode = this.whatsappService.getQRCode();

    if (!qrCode) {
      return {
        success: false,
        message: 'WhatsApp is already authenticated or waiting for initialization',
        isReady: this.whatsappService.isClientReady(),
      };
    }

    return {
      success: true,
      qrCode,
      message: 'Scan this QR code with WhatsApp',
      instructions: [
        '1. Open WhatsApp on your phone',
        '2. Tap Menu (⋮) or Settings',
        '3. Tap Linked Devices',
        '4. Tap Link a Device',
        '5. Scan this QR code',
      ],
    };
  }

  /**
   * Get WhatsApp connection status
   * GET /notifications/whatsapp/status
   */
  @Get('whatsapp/status')
  getStatus() {
    const isReady = this.whatsappService.isClientReady();
    const hasQR = this.whatsappService.getQRCode() !== null;

    return {
      isReady,
      hasQR,
      status: isReady ? 'connected' : hasQR ? 'waiting_for_qr_scan' : 'initializing',
      message: isReady
        ? '✅ WhatsApp is connected and ready'
        : hasQR
        ? '📱 Scan QR code to connect'
        : '⏳ Initializing WhatsApp client...',
    };
  }

  /**
   * Test WhatsApp message
   * GET /notifications/whatsapp/test/:phoneNumber
   */
  @Get('whatsapp/test/:phoneNumber')
  async testWhatsApp(phoneNumber: string) {
    if (!this.whatsappService.isClientReady()) {
      throw new HttpException(
        'WhatsApp is not ready. Please scan QR code first.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const success = await this.whatsappService.sendMessage(
      phoneNumber,
      '🎉 *Haraka WhatsApp Test*\n\nThis is a test message from Haraka delivery platform!\n\nYour notifications are now working via WhatsApp! ✅',
    );

    if (!success) {
      throw new HttpException(
        'Failed to send WhatsApp message',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return {
      success: true,
      message: `Test WhatsApp sent to ${phoneNumber}`,
    };
  }
}
