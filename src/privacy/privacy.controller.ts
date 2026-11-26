import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

/**
 * Privacy Policy & Terms of Service
 * Required by Google Play and Rwanda data protection law.
 */
@Controller('privacy')
export class PrivacyController {
  @Get()
  getPrivacyPolicy(@Res() res: Response) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Haraka - Privacy Policy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 { color: #e74c3c; margin-bottom: 10px; }
    h2 { color: #e74c3c; margin-top: 30px; margin-bottom: 15px; }
    p { margin-bottom: 15px; }
    ul { margin-left: 20px; margin-bottom: 15px; }
    li { margin-bottom: 8px; }
    .updated { color: #666; font-size: 14px; margin-bottom: 20px; }
    .contact { background: #f9f9f9; padding: 15px; border-left: 4px solid #e74c3c; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Haraka Privacy Policy</h1>
    <p class="updated">Last Updated: November 26, 2026</p>

    <h2>1. Introduction</h2>
    <p>Haraka ("we", "our", or "us") operates a food delivery and parcel delivery platform in Rwanda. We are committed to protecting your personal data and respecting your privacy rights.</p>

    <h2>2. Information We Collect</h2>
    <p>We collect and process the following personal information:</p>
    <ul>
      <li><strong>Account Information:</strong> Name, phone number, password (encrypted)</li>
      <li><strong>Location Data:</strong> GPS coordinates for delivery addresses and courier tracking</li>
      <li><strong>Order Information:</strong> Delivery addresses, food preferences, order history</li>
      <li><strong>Payment Information:</strong> Mobile money numbers (payments processed by PawaPay)</li>
      <li><strong>Communication Data:</strong> SMS notifications, support messages</li>
    </ul>

    <h2>3. How We Use Your Information</h2>
    <p>We use your personal information to:</p>
    <ul>
      <li>Process and deliver your food and parcel orders</li>
      <li>Connect you with nearby restaurants and couriers</li>
      <li>Send order status updates via SMS</li>
      <li>Process payments through our payment provider (PawaPay)</li>
      <li>Provide customer support</li>
      <li>Improve our services and prevent fraud</li>
    </ul>

    <h2>4. Data Storage & Security</h2>
    <p>Your data is stored securely using industry-standard encryption. Our servers are located in the United States (Oregon, via Render.com). We implement appropriate technical and organizational measures to protect your personal data.</p>

    <h2>5. Data Sharing</h2>
    <p>We share your information only when necessary:</p>
    <ul>
      <li><strong>Restaurants:</strong> Receive your order details and delivery address</li>
      <li><strong>Couriers:</strong> Receive delivery addresses and phone numbers for completed deliveries</li>
      <li><strong>Payment Processor (PawaPay):</strong> Processes mobile money payments</li>
      <li><strong>SMS Provider (Twilio):</strong> Sends order status notifications</li>
    </ul>
    <p>We never sell your personal data to third parties.</p>

    <h2>6. Your Rights</h2>
    <p>Under Rwanda's Data Protection Law (Law No. 058/2021), you have the right to:</p>
    <ul>
      <li>Access your personal data</li>
      <li>Correct inaccurate data</li>
      <li>Delete your account and personal data</li>
      <li>Withdraw consent for data processing</li>
      <li>Lodge a complaint with the National Cyber Security Authority (NCSA)</li>
    </ul>

    <h2>7. Account Deletion</h2>
    <p><strong>Courier App:</strong> Delete your account in the app under Profile → Delete Account, or contact support.</p>
    <p><strong>Customer & Restaurant Apps:</strong> Contact support to request account deletion.</p>
    <p>When you delete your account, all your personal data is permanently removed from our systems within 30 days.</p>

    <h2>8. Age Verification</h2>
    <p>Orders containing alcohol require age verification. By confirming you are 18 years or older when ordering alcohol, you certify that you meet Rwanda's legal drinking age.</p>

    <h2>9. Cookies & Tracking</h2>
    <p>Our mobile apps do not use cookies. Our admin dashboard may use essential cookies for authentication.</p>

    <h2>10. Changes to This Policy</h2>
    <p>We may update this privacy policy from time to time. We will notify you of significant changes via SMS or in-app notification.</p>

    <div class="contact">
      <h2>Contact Us</h2>
      <p>For privacy questions, data access requests, or account deletion:</p>
      <p><strong>Email:</strong> support@haraka.rw</p>
      <p><strong>Phone:</strong> +250 788 123 456</p>
      <p><strong>Address:</strong> Kigali, Rwanda</p>
    </div>

    <h2>11. Compliance</h2>
    <p>Haraka complies with:</p>
    <ul>
      <li>Rwanda Data Protection Law (Law No. 058/2021)</li>
      <li>Google Play Store Data Safety Requirements</li>
      <li>PCI DSS standards (via PawaPay payment processing)</li>
    </ul>
  </div>
</body>
</html>
    `;

    res.type('html').send(html);
  }

  @Get('terms')
  getTermsOfService(@Res() res: Response) {
    res.redirect('/privacy');
  }
}
