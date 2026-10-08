# Haraka Production Checklist

Legend: ✅ done in code and verified · 🔲 owner action (needs your accounts, dashboards or business data)

## A. Do immediately (security)

- 🔲 **Change the super admin password.** Production still accepts `admin@haraka.rw` / `admin123`. Log in to the dashboard → user menu → **Change password**. Until the new backend is deployed, use Staff → edit yourself → new password.
- 🔲 **Set `JWT_SECRET`** on Render to at least 32 random characters:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- 🔲 **Revoke the GitHub token** that is embedded in the backend's local git remote URL, then switch to Git Credential Manager or a new fine-grained token (see SECURITY.md → Residual risks).

## B. Render environment variables

See [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md).

- 🔲 `NODE_ENV=production`
- 🔲 `DATABASE_URL` (already set; production data verified reachable)
- 🔲 `JWT_SECRET` (new; see A)
- 🔲 `PAWAPAY_API_TOKEN` (already set; deposits verified against the PawaPay API)
- 🔲 `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. Check that the Twilio account is upgraded (not trial) and that Rwanda is enabled under Geo Permissions.
- 🔲 `WEBHOOK_SECRET`. Then add `?secret=<value>` to the PawaPay or forwarder callback URL.
- 🔲 `FRONTEND_URL`. Set it **only after** the admin dashboard is deployed (section D). Until then, leave it empty: location links use the backend-hosted page `https://harakabackend.onrender.com/confirm-location`, which works today.
- 🔲 `CORS_ORIGINS=http://localhost:3001`, only if you run the dashboard locally against production.
- 🔲 Optional: `EMAIL_USER` / `EMAIL_PASSWORD` (Gmail app password) to also email location links.
- 🔲 Delete unused variables (list in ENVIRONMENT_VARIABLES.md).

## C. Backend deploy

- ✅ JWT authentication on every endpoint that writes data or reads private data (restaurants, menus, orders, couriers, payments, withdrawals, seed)
- ✅ Location-link SMS through Twilio (`POST /merchants/:id/location/send-link` with `{ "sendSms": true }`), with a public confirmation page hosted by the backend
- ✅ `npm run build` passes, 126/126 end-to-end tests pass against a local Postgres plus a PawaPay mock, and the upgrade path was tested on the old schema
- ✅ Committed and pushed to `main`, so Render auto-deploys
- 🔲 Render → Logs: confirm `Haraka Backend API started` and **no** `JWT_SECRET is missing` error
- 🔲 Render → Settings: set Health Check Path to `/health`
- 🔲 `node scripts/smoke-test.js`: all checks pass, including "default admin password is NOT accepted"

## D. Admin dashboard

- ✅ Works with the new auth. New features: Restaurant App Login (set restaurant password), Courier Accounts (approve and deactivate), Payouts (restaurant withdrawals), Change password
- ✅ `npm run build` passes, 0 npm vulnerabilities
- 🔲 Push `admin-dashboard` to a GitHub repo (it has no remote yet) and deploy to Vercel with `NEXT_PUBLIC_API_URL=https://harakabackend.onrender.com/api/v1` (DEPLOYMENT.md §2)
- 🔲 Set `FRONTEND_URL` on Render to the Vercel URL

## E. Mobile apps (release new versions; old versions stop working for restaurants and couriers)

- ✅ Restaurant app: Restaurant ID + password login, server-filtered orders, withdrawal requests, session-expiry handling. `flutter test` passes and the debug APK builds.
- ✅ Courier app: JWT sessions, pending-approval flow, automatic logout of old sessions. `flutter test` passes and the debug APK builds.
- ✅ Customer app: server-priced orders (sends menu item IDs and restaurant ID, prices from restaurant GPS), private order history, readable error messages. `flutter test` passes and the debug APK builds.
- 🔲 Test each app in **debug on a phone** against production: log in, run one order end to end (section G)
- 🔲 Bump `version:` in each `pubspec.yaml`, then `flutter build apk --release` / `appbundle`, and distribute
- 🔲 Tell existing couriers to update and log in again. Approve them in Dashboard → Couriers if needed (couriers that already existed are auto-approved).

## F. Restaurants (production database currently has **zero** restaurants)

- ✅ The fake fallback restaurants were removed, and the demo seed is blocked in production
- 🔲 Onboard real restaurants: [ADDING_RESTAURANTS.md](ADDING_RESTAURANTS.md). For each one: create it, add the menu with real prices, send the location link, set the restaurant app password, and set opening hours (Kigali time)

## G. Verify after deploy (end-to-end, about 20 minutes, use small amounts)

1. 🔲 **Restaurant management:** create a test restaurant and two menu items. The customer app shows it.
2. 🔲 **GPS link:** Send Location Link. An SMS arrives with a `https://…/confirm-location?token=…` link. Open it on a phone and confirm. The dashboard shows "Confirmed by owner".
3. 🔲 **Restaurant login:** set its password, then log in to the restaurant app with the ID and password.
4. 🔲 **Courier:** register in the courier app, see "awaiting approval", approve in the dashboard, then log in.
5. 🔲 **Food order and payment:** order in the customer app with MTN MoMo (for example 100 RWF items) → approve on the phone → the order shows *Paid / Confirmed*, and the customer gets SMS for created and payment confirmed.
6. 🔲 **Restaurant flow:** restaurant app → Accept → Preparing → Ready (customer gets SMS at each step).
7. 🔲 **Courier flow:** the courier sees the job → Accept → Arrived → Picked up → Delivered (customer gets SMS). Courier earnings increase.
8. 🔲 **Parcel:** create a parcel delivery with *receiver pays*. The courier collects payment at delivery. The receiver approves on their phone. The order is marked paid.
9. 🔲 **Withdrawal:** restaurant app → withdraw a small amount → Dashboard → Payouts → *Pay via PawaPay* (needs payouts enabled and float), or *Mark paid* → status `paid`.
10. 🔲 **Security spot-check:** `node scripts/smoke-test.js` → all pass.

## H. Operations

- 🔲 Render Postgres: daily backups on (paid plan), and take a manual backup before each deploy that changes entities
- 🔲 Uptime monitor on `https://harakabackend.onrender.com/health` (for example UptimeRobot, free)
- 🔲 Upgrade Render to the Starter plan to avoid 30–50s cold starts
- 🔲 Plan the NestJS 11 upgrade (clears the remaining transitive `npm audit` advisories; see SECURITY.md)
