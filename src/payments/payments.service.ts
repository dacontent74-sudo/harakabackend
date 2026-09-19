import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

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
      const depositId = uuidv4(); // Generate proper 36-character UUID for PawaPay

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
      this.logger.log('📱 Phone number converted: ' + data.phoneNumber + ' -> ' + payload.payer.address.value);
      this.logger.log('💰 Amount: ' + amountNumber + ' RWF');
      this.logger.log('🏢 Correspondent: ' + correspondent);

      const response = await axios.post(
        `${this.pawapayBaseUrl}/deposits`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.pawapayToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        },
      );

      this.logger.log('✅ PawaPay deposit initiated:', JSON.stringify(response.data, null, 2));
      this.logger.log('📊 Response status: ' + response.status);
      this.logger.log('💳 Deposit status from PawaPay: ' + response.data.status);

      // Check if PawaPay accepted or rejected
      const pawapayStatus = response.data.status;
      let userMessage = 'Payment initiated. Please approve on your phone.';

      if (pawapayStatus === 'FAILED' || pawapayStatus === 'REJECTED') {
        this.logger.error('❌ PawaPay rejected deposit!');
        this.logger.error('Full response:', JSON.stringify(response.data, null, 2));
        this.logger.error('Failure reason:', response.data.failureReason);
        this.logger.error('Failure code:', response.data.failureCode);
        this.logger.error('Rejection reason:', response.data.rejectionReason);

        const failureMsg = response.data.failureReason
          || response.data.rejectionReason
          || response.data.failureMessage
          || response.data.reason
          || 'Unknown - check PawaPay dashboard';

        userMessage = `Payment failed: ${failureMsg}`;

        return {
          success: false,
          error: userMessage,
          pawapayStatus,
          fullResponse: response.data,
        };
      }

      return {
        success: true,
        depositId,
        status: pawapayStatus,
        message: userMessage,
        pawapayResponse: response.data, // Include full response for debugging
      };
    } catch (error) {
      this.logger.error('❌ PawaPay deposit failed:', error.response?.data || error.message);
      this.logger.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
      });

      // Specific error messages
      let errorMessage = 'Payment initiation failed';

      if (error.response?.status === 400) {
        errorMessage = 'Invalid phone number or amount. Please check and try again.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Payment service authentication failed. Please contact support.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Payment service access denied. Please contact support.';
      } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        errorMessage = 'Payment service timeout. Please try again.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      return {
        success: false,
        error: errorMessage,
        details: error.response?.data,
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
   * Debug method to show payload without sending
   */
  async debugPayload(data: {
    orderId: string;
    amount: number;
    phoneNumber: string;
    description: string;
  }) {
    const depositId = uuidv4(); // Generate proper 36-character UUID for PawaPay
    const correspondent = this.getCorrespondent(data.phoneNumber);
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
          value: data.phoneNumber.replace(/^0/, '250'),
        },
      },
      customerTimestamp: new Date().toISOString(),
      statementDescription: data.description,
    };

    return {
      success: true,
      message: 'This is what will be sent to PawaPay:',
      payload,
      phoneNumberConversion: {
        original: data.phoneNumber,
        converted: data.phoneNumber.replace(/^0/, '250'),
      },
      correspondent,
      apiUrl: `${this.pawapayBaseUrl}/deposits`,
      tokenPresent: !!this.pawapayToken,
      tokenPreview: this.pawapayToken ? this.pawapayToken.substring(0, 20) + '...' : 'NOT SET',
    };
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
