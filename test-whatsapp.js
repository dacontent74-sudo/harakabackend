const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('🚀 Starting Haraka WhatsApp Integration Test...\n');

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './whatsapp-session',
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// QR Code event
client.on('qr', (qr) => {
  console.log('\n📱 ==================== SCAN QR CODE ====================\n');
  qrcode.generate(qr, { small: true });
  console.log('\n👆 Scan this QR code with your WhatsApp app:\n');
  console.log('1. Open WhatsApp on your phone');
  console.log('2. Tap Menu (⋮) or Settings');
  console.log('3. Tap "Linked Devices"');
  console.log('4. Tap "Link a Device"');
  console.log('5. Scan the QR code above\n');
  console.log('========================================================\n');
});

// Authenticated event
client.on('authenticated', () => {
  console.log('✅ WhatsApp authenticated successfully!');
  console.log('🔒 Session saved. Next time no QR code needed!\n');
});

// Ready event
client.on('ready', async () => {
  console.log('🎉 WhatsApp is READY! You can now send messages.\n');
  console.log('💡 TIP: To send a test message, uncomment the test code below.\n');

  // TEST MESSAGE (UNCOMMENT TO SEND)
  // Replace with your phone number
  // const testNumber = '+250788123456'; // Your number
  // const chatId = testNumber.replace('+', '') + '@c.us';
  //
  // try {
  //   await client.sendMessage(chatId, '🎉 *Haraka WhatsApp Test*\n\nThis is a test message from Haraka!\n\nYour WhatsApp notifications are working! ✅');
  //   console.log('✅ Test message sent successfully!\n');
  // } catch (error) {
  //   console.error('❌ Failed to send test message:', error.message);
  // }

  console.log('✅ WhatsApp client is running and ready.');
  console.log('📝 Press Ctrl+C to stop.\n');
});

// Disconnected event
client.on('disconnected', (reason) => {
  console.log(`❌ WhatsApp disconnected: ${reason}`);
  process.exit(0);
});

// Error event
client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
  process.exit(1);
});

// Start the client
console.log('⏳ Initializing WhatsApp client...');
console.log('⏳ This may take 10-30 seconds on first run...\n');

client.initialize().catch((error) => {
  console.error('❌ Failed to initialize WhatsApp:', error.message);
  process.exit(1);
});
