# Haraka Environment Variables

## Backend (Render → `haraka-backend` → Environment)

After changing any variable, Render redeploys automatically. If it does not, use **Manual Deploy → Deploy latest commit**.

### Required in production

| Variable | Example | What it does |
|---|---|---|
| `NODE_ENV` | `production` | Turns on production behaviour: the debug payment endpoint is disabled, and the webhook guard is not relaxed. |
| `DATABASE_URL` | `postgresql://user:pass@host/db` | PostgreSQL connection string. Use Render's **Internal Database URL** if the database is on Render. SSL is used automatically. |
| `JWT_SECRET` | 64+ random hex chars | Signs and verifies **all** login tokens (staff, courier, restaurant). **Must be at least 32 characters.** If it is missing or weak in production, the server uses a random secret for each process, so everyone is logged out on every restart. Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Changing it logs everyone out. |
| `PAWAPAY_API_TOKEN` | `eyJ...` | PawaPay API token. Used for deposits (customer payments), payouts (restaurant withdrawals) and to verify webhooks. |
| `TWILIO_ACCOUNT_SID` | `AC...` | Twilio account for SMS (order updates, restaurant location links). |
| `TWILIO_AUTH_TOKEN` | `...` | Twilio auth token. |
| `TWILIO_FROM_NUMBER` | `+1...` | The Twilio phone number that sends the SMS. `TWILIO_PHONE_NUMBER` is accepted as an alias. |

If a Twilio variable is missing, SMS is disabled and the server logs `Twilio NOT configured`. At boot the server also checks the credentials with Twilio (free, no SMS sent). The Render logs then show one of these:

- `✅ Twilio credentials valid: account active, type Full`: everything is fine.
- `⚠️ Twilio TRIAL account`: SMS reach **only verified numbers** (see below).
- `❌ Twilio credential check FAILED (20003)`: the SID or token is wrong. Copy both again from https://console.twilio.com → Account Info. The token is exactly 32 characters and the SID is `AC` + 32 characters.

Every failed SMS is logged as `❌ SMS FAILED to +250… [Twilio <code>]: … -> <fix>`.

#### Twilio trial accounts

A trial account can only text numbers listed under **Phone Numbers → Manage → Verified Caller IDs** (each needs a code sent to that phone). Messages also start with "Sent from your Twilio trial account". Customers and restaurants will not get SMS (error **21608**) until you either:

- **Upgrade:** Console → **Upgrade account** (add a payment method; you pay per SMS, and there is no monthly fee for messaging itself beyond the number rental). This is the only real fix for production.
- **Test only:** verify your own test phones as Verified Caller IDs.

Also enable Rwanda under **Messaging → Settings → Geo permissions**, otherwise you get error **21408**.

### Admin alerts

Admins are notified **only in the admin dashboard** (bell with unread badge, pop-up toast, sound,
optional desktop notification), pushed live over Server-Sent Events. Admins get no SMS or email,
so `ADMIN_PHONE` / `ADMIN_EMAIL` / `ADMIN_SMS_EVENTS` are no longer used and can be deleted on Render.
Restaurants, couriers and customers still get their SMS.

Events: new order, payment received, order cancelled (flagged "refund needed" if it was paid),
withdrawal requested, and system alerts (SMS delivery failing, payment amount mismatch, unexpected
HTTP 5xx errors; each muted for 30 minutes after it fires).

| Variable | Default | What it does |
|---|---|---|
| `ADMIN_NOTIFICATIONS_MAX` | `100` | Optional. Number of notifications kept in the `admin_notifications` table. |
| `ADMIN_NOTIFICATIONS_RETENTION_DAYS` | `7` | Optional. Notifications older than this are deleted (checked every 15 minutes). |

Dashboard notification endpoints (any staff JWT, prefix `/api/v1`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/notifications/stream` | Server-Sent Events: `ready`, `notification`, `update` (read/delete sync), `ping` every 25 s |
| GET | `/admin/notifications?limit=50&unread=true&before=<id>` | `{ data, hasMore, unreadCount }` |
| GET | `/admin/notifications/unread-count` | `{ unreadCount }` |
| POST | `/admin/notifications/:id/read`, `/:id/unread`, `/read-all` | Mark read / unread |
| DELETE | `/admin/notifications/:id`, `/admin/notifications` | Delete one / clear all |

Admin-only test endpoints (super_admin/admin JWT, prefix `/api/v1`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/notifications/status` | Twilio configuration, credential check result (Trial/Full), sent/failed counters, last error with fix, admin alert recipients |
| POST | `/notifications/verify-twilio` | Re-run the Twilio credential check (sends nothing) |
| POST | `/notifications/test-sms` `{ "to": "+250788123456" }` | Send one real SMS. The response contains Twilio's error code and the fix |
| POST | `/notifications/test-admin` | Push a test notification to every open admin dashboard |

### Strongly recommended

| Variable | Example | What it does |
|---|---|---|
| `FRONTEND_URL` | `https://haraka-admin.vercel.app` | URL of the deployed **admin dashboard**. It is used for (1) restaurant GPS confirmation links (`<FRONTEND_URL>/confirm-location?token=…`) and (2) the CORS allow-list. **If you leave it empty, links use the confirmation page the backend hosts itself (`https://harakabackend.onrender.com/confirm-location`), which works with no other setup.** Only set it once the dashboard is deployed. |
| `CORS_ORIGINS` | `http://localhost:3001` | Extra browser origins allowed to call the API, comma-separated. Once `FRONTEND_URL` is set, CORS is restricted to that URL plus this list. Add `http://localhost:3001` if you also run the dashboard locally against production. |
| `WEBHOOK_SECRET` | random string | Shared secret for the PawaPay webhook. Configure your webhook forwarder (or PawaPay) to send it as the `X-Webhook-Secret` header, or append `?secret=<value>` to the webhook URL. Every webhook is also checked against the PawaPay API, so this is defence in depth. |
| `DEFAULT_ADMIN_PASSWORD` | strong password | Only used when **no** super admin exists (for example a fresh database). If it is empty, a random password is generated and printed once in the logs. |
| `DEFAULT_ADMIN_EMAIL` | `admin@haraka.rw` | Email for that first super admin. |

### Optional

| Variable | Default | What it does |
|---|---|---|
| `PORT` | set by Render | HTTP port. |
| `PUBLIC_BASE_URL` | `RENDER_EXTERNAL_URL` or `https://harakabackend.onrender.com` | Public backend URL. Used for links when `FRONTEND_URL` is empty. |
| `EMAIL_USER` / `EMAIL_PASSWORD` | – | Gmail address and **App Password**. Used to email location links to restaurants and admin alerts (`ADMIN_EMAIL`). Optional because SMS is the main channel. |
| `PAWAPAY_API_URL` | `https://api.pawapay.cloud` | PawaPay API base URL. Set `https://api.sandbox.pawapay.cloud` for sandbox testing **together with a sandbox token**. (The old `PAWAPAY_BASE_URL` is deliberately ignored.) |
| `WEBHOOK_ALLOWED_IPS` | – | Comma-separated IPs allowed to call the webhook. |
| `RATE_LIMIT_PER_MINUTE` | `120` | Global requests per minute per client IP. Logins (5/min), order creation (10/min) and payment initiation (10/min) have stricter limits of their own. |
| `COURIER_REQUIRE_APPROVAL` | `true` | New courier sign-ups must be approved in the dashboard before they can log in. Set `false` to auto-approve (not recommended: job listings include customer phone numbers and addresses). |
| `FOOD_SERVICE_FEE` | `100` | Flat service fee in RWF added to food orders. **The customer app shows 100**, so change both together. |
| `BUSINESS_TIMEZONE` | `Africa/Kigali` | Time zone used to decide whether a restaurant is open from its opening hours. |
| `ALLOW_DEMO_SEED` | – | Set `true` only on a staging server to allow `POST /seed` (demo restaurants). It is always blocked in production otherwise. |
| `JWT_STAFF_EXPIRES_IN` | `12h` | Admin dashboard session length. |
| `JWT_COURIER_EXPIRES_IN` | `30d` | Courier app session length. |
| `JWT_MERCHANT_EXPIRES_IN` | `30d` | Restaurant app session length. |
| `DB_SYNCHRONIZE` | `true` | Auto-creates and updates database tables from the code. All schema changes so far are additive. Set `false` once you adopt migrations. |
| `DATABASE_SSL` | on whenever `DATABASE_URL` is set | Set `false` for a local Postgres without SSL. |

### Not used (safe to delete from Render or `.env`)

`API_PREFIX`, `DATABASE_HOST/PORT/USER/PASSWORD/NAME` (only `DATABASE_URL` is used), `REDIS_*`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRATION`, `JWT_REFRESH_EXPIRATION`, `MAPBOX_*`, `FIREBASE_*`, `AFRICASTALKING_*` (replaced by Twilio), `PAWAPAY_BASE_URL`, `PAWAPAY_ENVIRONMENT`, `PAWAPAY_API_KEY`, `PAWAPAY_WEBHOOK_SECRET` (use `WEBHOOK_SECRET`), `MOTORCYCLE_*` / `CAR_*` (delivery prices are defined in `src/pricing/pricing.service.ts`), `MERCHANT_COMMISSION_RATE`, `COURIER_EARNING_RATE`, `PLATFORM_FEE_RATE`, dispatch / websocket / upload settings, and `*_APP_URL`.

## Admin dashboard (Vercel / Netlify / any Next.js host)

| Variable | Example | What it does |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://harakabackend.onrender.com/api/v1` | Backend API base **including `/api/v1`**. If it is not set, the dashboard uses this production URL. |

## Mobile apps

The Flutter apps have the API URL in their code (`https://harakabackend.onrender.com/api/v1`) in `lib/api_service.dart`. They have no environment variables.

## Setting variables on Render

1. Open https://dashboard.render.com → **haraka-backend** → **Environment**.
2. Click **Add Environment Variable** (or edit an existing one) and save.
3. Render redeploys. Check **Logs** for `Haraka Backend API started`.
4. Run `node scripts/smoke-test.js` from the backend folder.
