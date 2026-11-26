# 💬 WhatsApp Business API Setup Guide

**Cost Savings: ~$4,000/year compared to SMS!**

---

## 🚀 QUICK START (Testing - 5 minutes)

### **Step 1: Enable Twilio Sandbox**

1. **Go to Twilio Console**
   - Login: https://console.twilio.com
   - Navigate: **Messaging** → **Try it out** → **Send a WhatsApp message**

2. **Get Sandbox Number**
   - You'll see: `whatsapp:+14155238886` (Twilio's sandbox number)
   - Copy this number

3. **Join Sandbox (Test Users)**
   - Each test user sends this WhatsApp message to `+1 415 523 8886`:
   - Message: `join <your-sandbox-code>` (e.g., `join happy-tiger`)
   - They'll receive confirmation
   - **Important:** Each customer/restaurant must join sandbox before testing!

4. **Update Backend .env**
   ```bash
   TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
   WHATSAPP_ENABLED=true
   ```

5. **Restart Backend**
   ```bash
   npm run start:dev
   ```

6. **Test!**
   - Create a test order
   - You'll receive WhatsApp message instead of SMS!
   - **Cost: FREE during testing!**

---

## 🏢 PRODUCTION SETUP (2-3 weeks)

### **Step 1: Apply for WhatsApp Business Account**

1. **Go to Twilio Console**
   - Navigate: **Messaging** → **WhatsApp** → **Senders**
   - Click: **Request to enable WhatsApp**

2. **Business Verification Documents**
   Required:
   - Business registration certificate
   - Tax ID / TIN number
   - Business address proof
   - Website URL (or social media page)
   - Business description

3. **Submit Application**
   - Fill out business profile
   - Upload documents
   - Review time: **5-10 business days**

---

### **Step 2: Get Your WhatsApp Business Number**

**Option A: Use Existing Twilio Number**
1. Go to: **Phone Numbers** → **Manage** → **Active numbers**
2. Click your number
3. Under **Messaging**: Enable **WhatsApp**
4. Format: `whatsapp:+<your-twilio-number>`

**Option B: Get New Number**
1. Go to: **Phone Numbers** → **Buy a number**
2. Select country: **Rwanda** (or international)
3. Enable: **SMS** and **WhatsApp**
4. Purchase number
5. Format: `whatsapp:+<your-new-number>`

**Recommended:** Use separate number for WhatsApp (not same as SMS)

---

### **Step 3: Create Message Templates**

WhatsApp requires **pre-approved** message templates for outbound messages.

#### **Template 1: Payment Confirmed**
```
Name: payment_confirmed
Category: UTILITY
Language: English

Message:
✅ Payment confirmed!

Order #{{1}}
Amount: {{2}} RWF

Your order is being prepared. We'll notify you when it's ready for delivery.

Haraka - Fast Delivery

Variables:
{{1}} = Order ID
{{2}} = Amount
```

#### **Template 2: New Order (Restaurant)**
```
Name: new_order_restaurant
Category: UTILITY
Language: English

Message:
🔔 NEW ORDER!

Order #{{1}}
Items: {{2}}
Total: {{3}} RWF

Please prepare this order.

Haraka

Variables:
{{1}} = Order ID
{{2}} = Items list
{{3}} = Total amount
```

#### **Template 3: Courier On The Way**
```
Name: courier_on_way
Category: UTILITY
Language: English

Message:
🏍️ Your order is on the way!

Order #{{1}}
Courier: {{2}}

Estimated arrival: 15-30 minutes

Haraka - Fast Delivery

Variables:
{{1}} = Order ID
{{2}} = Courier name
```

#### **Template 4: Order Delivered**
```
Name: order_delivered
Category: UTILITY
Language: English

Message:
{{1}} Delivered!

Order #{{2}} has been successfully delivered.

Thank you for using Haraka!

Haraka - Fast Delivery

Variables:
{{1}} = Emoji (🍽️ or 📦)
{{2}} = Order ID
```

**How to Submit:**
1. Twilio Console → **Messaging** → **WhatsApp** → **Templates**
2. Click: **Create Template**
3. Fill in template details
4. Submit for approval
5. **Approval time:** 1-3 business days per template

---

### **Step 4: Update Production Environment**

#### **On Render.com:**
1. Go to: **Dashboard** → **haraka-backend** → **Environment**
2. Add/Update:
   ```
   TWILIO_WHATSAPP_NUMBER=whatsapp:+<your-business-number>
   WHATSAPP_ENABLED=true
   ```
3. Click: **Save Changes**
4. Backend will auto-redeploy

---

### **Step 5: Customer Opt-In**

**Important:** Customers must **opt-in** to receive WhatsApp messages!

#### **Method 1: In-App Checkbox**
Add to customer app:
```
☑️ I want to receive order updates via WhatsApp
```

#### **Method 2: First Order**
When customer creates account, ask:
```
How would you like to receive notifications?
○ SMS (slower, standard rates)
● WhatsApp (faster, free for you!)
```

#### **Method 3: Automatic (After First Message)**
Once customer sends any message to your WhatsApp number, they're opted in!

---

## 💰 PRICING BREAKDOWN

### **Twilio Fees (Per Message):**
- **Twilio Platform Fee:** $0.005 per message
- **Failed Message:** +$0.001 (if delivery fails)

### **Meta Fees (Per Conversation):**

WhatsApp uses **conversation-based pricing** (changed 2026):

| Conversation Type | Rwanda Rate | When Used |
|---|---|---|
| **Utility** | ~$0.0034 | Order updates, delivery status |
| **Authentication** | ~$0.0034 | OTP, login codes |
| **Marketing** | ~$0.025 | Promotions, offers |
| **Service** | ~$0.0034 | Customer support replies |

**Free Service Conversations:**
- First **1,000 service conversations per month** are FREE
- After 1,000: standard rates apply

### **Cost Examples:**

#### **100 Orders/Month:**
- 400 messages (4 per order)
- All utility messages: 400 × $0.0084 = **$3.36/month**
- vs SMS: 400 × $0.33 = **$132/month**
- **Savings: $128.64/month** = **$1,544/year**

#### **500 Orders/Month:**
- 2,000 messages
- All utility messages: 2,000 × $0.0084 = **$16.80/month**
- vs SMS: 2,000 × $0.33 = **$660/month**
- **Savings: $643.20/month** = **$7,718/year**

---

## 🎯 ROLLOUT PLAN

### **Week 1: Testing (Sandbox)**
- ✅ Set up Twilio sandbox
- ✅ Test with 5-10 internal users
- ✅ Verify all message types work
- ✅ Monitor delivery rates

### **Week 2: Business Verification**
- 📋 Submit business verification documents
- 📝 Create message templates
- ⏳ Wait for approval (5-10 days)

### **Week 3: Template Approval**
- ⏳ Wait for template approval (1-3 days each)
- 🧪 Test approved templates in sandbox
- ✅ Update backend with production number

### **Week 4: Pilot Launch**
- 🚀 Enable WhatsApp for pilot users
- 📊 Monitor delivery rates (target: 95%+)
- 💰 Track cost savings
- 📱 Keep SMS as fallback

### **Month 2: Full Production**
- ✅ WhatsApp primary (90% of users)
- ✅ SMS fallback (10% legacy users)
- 💸 Save ~$400/month

---

## 🔧 TECHNICAL INTEGRATION

### **Backend Changes (Already Done):**
- ✅ `WhatsAppService` created
- ✅ WhatsApp-first with SMS fallback
- ✅ Payment notifications use WhatsApp
- ✅ Restaurant notifications use WhatsApp
- ✅ Environment variables configured

### **Mobile App Changes (TODO):**

#### **Customer App:**
1. Add opt-in checkbox during registration
2. Add "Notification Preferences" in settings
3. Send `preferredNotification: 'whatsapp'` in orders

#### **Restaurant App:**
1. Add opt-in during restaurant setup
2. Store WhatsApp number in restaurant profile

#### **Courier App:**
1. Add opt-in during courier registration
2. Store WhatsApp number in courier profile

---

## 📊 MONITORING

### **Track These Metrics:**

1. **Delivery Rate:** Target: 95%+
2. **Cost per Message:** Should be ~$0.008
3. **Fallback Rate:** SMS fallback should be <10%
4. **Customer Opt-In:** Target: 80%+ choose WhatsApp

### **Dashboard Alerts:**

Set up alerts for:
- WhatsApp delivery failures >5%
- Template rejections
- Monthly spend >$50

---

## ❓ TROUBLESHOOTING

### **"Message template not approved"**
**Solution:** Wait 1-3 days or check template status in console

### **"Customer has not opted in"**
**Solution:** Customer must join sandbox OR send first message

### **"Invalid WhatsApp number"**
**Solution:** Number must start with `whatsapp:+`

### **"Capability not enabled"**
**Solution:** Enable WhatsApp for your Twilio number in console

### **High costs**
**Check:**
- Are you using UTILITY templates? (cheapest)
- Are templates approved? (rejected = fallback to SMS)
- Is conversation-based pricing enabled?

---

## 🔗 USEFUL LINKS

| Resource | URL |
|---|---|
| **Twilio WhatsApp Console** | https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn |
| **WhatsApp Template Manager** | https://console.twilio.com/us1/develop/sms/content-editor/content |
| **Pricing Calculator** | https://www.twilio.com/whatsapp/pricing |
| **WhatsApp Business Docs** | https://www.twilio.com/docs/whatsapp |
| **Template Guidelines** | https://developers.facebook.com/docs/whatsapp/message-templates/guidelines |

---

## 📞 SUPPORT

### **Need Help?**

1. **Twilio Support:** https://support.twilio.com
2. **WhatsApp Business:** https://business.whatsapp.com/support
3. **Haraka Backend Logs:** Check Render.com logs for delivery status

---

## ✅ CHECKLIST

### **Sandbox Testing (Day 1):**
- [ ] Login to Twilio Console
- [ ] Find sandbox number and code
- [ ] Join sandbox with test phone
- [ ] Update .env with sandbox number
- [ ] Restart backend
- [ ] Create test order
- [ ] Verify WhatsApp message received

### **Production Setup (Weeks 1-4):**
- [ ] Submit business verification
- [ ] Wait for approval (5-10 days)
- [ ] Create message templates
- [ ] Wait for template approval (1-3 days each)
- [ ] Get WhatsApp business number
- [ ] Update production .env
- [ ] Deploy backend
- [ ] Test in production
- [ ] Enable for pilot users
- [ ] Monitor delivery rates
- [ ] Track cost savings

---

**Next Step:** Start with Sandbox Testing (5 minutes)!
