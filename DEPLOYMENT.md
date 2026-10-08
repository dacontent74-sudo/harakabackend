# Haraka Deployment Guide

| Part | Where it runs | How it deploys |
|---|---|---|
| Backend API (NestJS) | Render: `https://harakabackend.onrender.com` | Push to `main` on GitHub. Render rebuilds automatically |
| Database (PostgreSQL) | Render Postgres or any managed Postgres | `DATABASE_URL`. Tables are created and updated automatically |
| Admin dashboard (Next.js 16) | Vercel, Netlify or any Node host | `npm run build`, or connect the repo to Vercel |
| Customer / Courier / Restaurant apps (Flutter) | Android APK / Play Store | `flutter build apk --release` / `appbundle` |
| SMS | Twilio | Environment variables |
| Payments | PawaPay | Environment variables and a webhook URL |

---

## 1. Backend (Render)

### First-time setup
1. Render → **New → Web Service** → connect the GitHub repo `harakabackend`.
2. Settings (these are also in `render.yaml`):
   - Build command: `npm install && npm run build`
   - Start command: `npm run start:prod`
   - Health check path: `/health`
3. Add the environment variables from [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md). The minimum is `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `PAWAPAY_API_TOKEN` and the three `TWILIO_*` variables.
4. Deploy. The first boot creates the tables and the first super admin (see `DEFAULT_ADMIN_*`).

### Every update
```bash
cd backend
npm run build                       # must compile with no errors
git add -A && git commit -m "..."
git push origin main                # Render auto-deploys
```
Then watch Render → **Logs** until you see `Haraka Backend API started`, and run:
```bash
node scripts/smoke-test.js          # read-only checks against production
```

### Notes
- The compiled entry point is `dist/src/main.js`. `npm run build` also writes a `dist/main.js` shim, so `node dist/main` and `node dist/src/main` both work.
- On the free plan the service sleeps after about 15 minutes idle. The first request after that takes 30–50 seconds. The apps use 60s timeouts. Upgrade to the Starter plan to avoid cold starts in production.
- Schema changes are applied by TypeORM `synchronize` on startup. All changes so far only add columns and tables (`couriers.isApproved`, `merchants.passwordHash`, `withdrawals`). Existing couriers stay approved. **Take a database backup before every deploy that touches entities** (Render Postgres → Backups).
- Rollback: Render → **Events** → pick the previous deploy → **Rollback**.

### PawaPay webhook
In the PawaPay dashboard (or in the forwarder that relays PawaPay callbacks) set the deposit callback URL to:
```
https://harakabackend.onrender.com/api/v1/payments/webhooks/pawapay?secret=<WEBHOOK_SECRET>
```
or send the header `X-Webhook-Secret: <WEBHOOK_SECRET>`. Every callback is also checked against the PawaPay API before an order is marked paid. If a callback is lost, the app's status polling confirms the payment instead.

---

## 2. Admin dashboard

The dashboard is a static-friendly Next.js 16 app in `admin-dashboard/`.

### Vercel (recommended)
1. Push `admin-dashboard/` to its own GitHub repo. It is a local git repo with **no remote yet**: `git remote add origin <url> && git push -u origin main`.
2. Vercel → **Add New Project** → import the repo. Framework: Next.js (auto-detected).
3. Environment variable: `NEXT_PUBLIC_API_URL=https://harakabackend.onrender.com/api/v1`
4. Deploy. You get a URL such as `https://haraka-admin.vercel.app`.
5. On Render, set `FRONTEND_URL` to that URL. This restricts CORS to the dashboard and makes location links point to the dashboard's `/confirm-location` page.

### Any Node host
```bash
cd admin-dashboard
npm ci
NEXT_PUBLIC_API_URL=https://harakabackend.onrender.com/api/v1 npm run build
npm start            # serves on port 3000 (use PORT=3001 to change)
```

### Local development
```bash
cd admin-dashboard && npm run dev -- -p 3001
```
If `FRONTEND_URL` is set on Render, add `http://localhost:3001` to `CORS_ORIGINS` so the local dashboard can call the production API.

---

## 3. Mobile apps (Flutter)

All three apps call `https://harakabackend.onrender.com/api/v1` (`lib/api_service.dart`).

```bash
cd restaurant_app   # or courier_app, customer-app
flutter pub get
flutter test
flutter run         # test the whole flow in debug on a phone first
flutter build apk --release          # sideload / direct download
flutter build appbundle --release    # Google Play
```

**Required app updates after this release.** The backend now requires real logins:

| App | What changed | What users must do |
|---|---|---|
| Restaurant app | Logs in with **Restaurant ID + password**. Shows only its own orders. Withdrawals become requests that an admin approves | An admin sets each restaurant's password in the dashboard. Then install the new APK and log in |
| Courier app | Uses signed tokens. Old sessions are logged out automatically. New sign-ups wait for approval | Log in again. New couriers must be approved in the dashboard |
| Customer app | Order history shows only orders placed on this phone. Prices are confirmed by the server | Install the update. Older app versions can still order, but cannot list history (`GET /orders` now needs a login) |

Bump `version:` in each `pubspec.yaml` before you publish a release.

---

## 4. Twilio SMS
1. https://console.twilio.com → copy the **Account SID** and **Auth Token**, and buy or choose a sender number.
2. Rwanda delivery: make sure **Geo Permissions** allow Rwanda (+250) under Messaging → Settings.
3. A trial account can only text verified numbers. Upgrade the account before launch.
4. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER` on Render.

## 5. Post-deploy verification
Run through [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) section "Verify after deploy".
