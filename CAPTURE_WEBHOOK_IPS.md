# 📋 CAPTURE WEBHOOK IPs - STEP BY STEP

## Step 1: Check Render Logs Right Now

1. Go to: https://dashboard.render.com
2. Click on your **harakabackend** service
3. Click **Logs** tab (left sidebar)
4. Search for: `🔒 Webhook from IP`
5. Look for recent webhook attempts

You should see lines like:
```
🔒 Webhook from IP: 54.123.45.67, User-Agent: python-requests/2.31.0
```

## Step 2: Test Payment and Capture IP

1. Make a test parcel order in your app
2. Complete payment via PawaPay
3. Immediately check Render logs
4. Find the line: `🔒 Webhook from IP: XX.XX.XX.XX`
5. That's Africa Cyber Trust's IP!

## Step 3: Add IPs to Whitelist

Once you have the IP(s), tell me and I'll add them to the webhook guard.

Example:
- "The IP is 54.123.45.67"
- "I see two IPs: 54.123.45.67 and 52.18.56.89"

## Common Render IP Ranges:

Render uses AWS infrastructure, typical IPs:
- 54.x.x.x
- 52.x.x.x  
- 34.x.x.x

---

**ACTION REQUIRED:**
Please check your Render logs now and tell me what IP(s) you see!

Then I'll add them to the whitelist immediately.
