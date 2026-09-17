import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly pawapayBaseUrl = 'https://api.pawapay.cloud';
  private readonly pawapayToken = process.env.PAWAPAY_API_TOKEN;

  /**
   * Initiate a mobile money deposit payment
   */
  async initiateDeposit(data: {
    orderId: string;
    amount: number;
    phoneNumber: string;
    description: string;
  }) {
    try {
      const depositId = `${data.orderId}-${Date.now()}`;

      // Determine correspondent based on phone number prefix
      const correspondent = this.getCorrespondent(data.phoneNumber);

      // Parse amount (comes as string from database)
      const amountNumber = typeof data.amount === 'string'
        ? parseFloat(data.amount)
        : data.amount;

      const payload = {
        depositId,
        amount: amountNumber.toFixed(2),
        currency: 'RWF',
        correspondent,
        payer: {
          type: 'MSISDN',
          address: {
            value: data.phoneNumber.replace(/^0/, '250'), // Convert 078... to 250788...
          },
        },
        customerTimestamp: new Date().toISOString(),
        statementDescription: data.description,
      };

      this.logger.log('🔵 Initiating PawaPay deposit:', JSON.stringify(payload, null, 2));

      const response = await axios.post(
        `${this.pawapayBaseUrl}/deposits`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.pawapayToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log('✅ PawaPay deposit initiated:', response.data);

      return {
        success: true,
        depositId,
        status: response.data.status,
        message: 'Payment initiated. Please approve on your phone.',
      };
    } catch (error) {
      this.logger.error('❌ PawaPay deposit failed:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.message || 'Payment initiation failed',
      };
    }
  }

  /**
   * Check payment status
   */
  async checkDepositStatus(depositId: string) {
    try {
      const response = await axios.get(
        `${this.pawapayBaseUrl}/deposits/${depositId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.pawapayToken}`,
          },
        },
      );

      return {
        success: true,
        status: response.data.status,
        data: response.data,
      };
    } catch (error) {
      this.logger.error('❌ Status check failed:', error.response?.data || error.message);

      return {
        success: false,
        error: 'Failed to check payment status',
      };
    }
  }

  /**
   * Determine mobile money operator from phone number
   */
  private getCorrespondent(phoneNumber: string): string {
    // Remove leading 0 or 250
    const normalized = phoneNumber.replace(/^(0|250)/, '');

    // MTN: 078, 079
    if (normalized.startsWith('78') || normalized.startsWith('79')) {
      return 'MTN_MOMO_RWA';
    }

    // Airtel: 073
    if (normalized.startsWith('73')) {
      return 'AIRTEL_MOMO_RWA';
    }

    // Default to MTN
    return 'MTN_MOMO_RWA';
  }
}
