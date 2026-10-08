# Haraka Security Audit and Security Measures

Audit date: 2026-10-08. Scope: backend API, admin dashboard, the customer, courier and restaurant apps, and the production configuration.

## 1. Findings and fixes

### Critical

| # | Finding (before) | Fix |
|---|---|---|
| C1 | **Restaurant, menu and order endpoints had no authentication.** Anyone could create, edit or delete restaurants and menus and change any order's status. | JWT plus role guards on every endpoint that writes data or reads private data (see [API_AUTHENTICATION.md](API_AUTHENTICATION.md)). |
| C2 | **`GET /orders` was public.** It returned every order with customer names, phone numbers and addresses (82 orders were exposed in production). | Now restricted to staff, or to a restaurant for its own orders. Customers look up only their own orders by ID (`POST /orders/lookup`). |
| C3 | **Forgeable courier tokens.** Tokens were the plain string `courier_<id>_<time>`, and a missing header defaulted to courier #1. Anyone could act as any courier. | Real signed JWTs. Every job endpoint takes the courier ID from the verified token. Ownership is checked on status updates and payment collection. |
| C4 | **Payment webhook trusted its payload.** Any request with `User-Agent: python-requests` could mark any order as paid. | The backend re-checks every deposit with the PawaPay API (status **and amount**) before marking it paid. Optional shared secret `WEBHOOK_SECRET`. |
| C5 | **`POST /payments/manual-confirm/:depositId` was public.** Anyone could mark orders paid. | Admins only. It re-checks with PawaPay first. Only a super admin can force a confirmation, and every use is written to the audit log. |
| C6 | **Client-controlled prices.** `POST /orders` stored the request body as-is: price, total, `status`, `paymentStatus`, `courierId`. A customer could pay 1 RWF for any order, or create orders that were already "paid". | Only listed fields are accepted. Item prices come from the database menu. Distance, delivery fee and total are recomputed on the server. Status and payment fields are set only by the server. |
| C7 | **Restaurant "withdrawal" used the deposits API**, which *charges* the phone number instead of paying it. It also never reduced the balance, so it could be repeated. It was public, and the restaurant app had no password. | Withdrawals are now requests owned by the restaurant, under a row lock so concurrent requests cannot overspend. Admins pay them out with the PawaPay **payouts** API or mark them paid. Restaurant login uses a bcrypt password. |
| C8 | **The production super admin still used the default password `admin123`** (verified 2026-10-08). | The code no longer creates `admin123`: it uses `DEFAULT_ADMIN_PASSWORD` or a random password. **The existing account's password must be changed now** (see the checklist). |
| C9 | **Hard-coded JWT secret fallback** (`haraka-secret-key-change-in-production`). | No fallback in production. If `JWT_SECRET` is missing or shorter than 32 characters, a random secret is used for each process and an error is logged. Tokens signed with the old default are rejected. Only HS256 is accepted (no `alg=none`). |
| C10 | **`POST /seed` was public.** | Super admin only, and blocked in production (the demo data uses real restaurant names). |

### High

| # | Finding | Fix |
|---|---|---|
| H1 | Anyone could install the courier app, register, and see customers' phone numbers and addresses. | New couriers need admin approval (`COURIER_REQUIRE_APPROVAL`). Couriers can be deactivated, which revokes access immediately. |
| H2 | Two couriers could accept the same job at the same time. | Atomic conditional `UPDATE` claim. |
| H3 | Couriers could mark any order delivered, and could do it more than once (double-counted earnings). | Ownership check, allowed status transitions, and earnings counted only once. |
| H4 | An admin could create a super admin. `PUT /auth/users/:id` accepted any field. | Only a super admin can create admins. Updates accept only listed fields, with role validation. The last super admin cannot be demoted or deactivated. |
| H5 | No rate limiting on login (brute force). The global throttler was configured but never enforced, and limits were per proxy IP. | A global `ThrottlerGuard` with `trust proxy`, so limits use the real client IP. Logins 5/min, order and payment creation 10/min, global 120/min. |
| H6 | WhatsApp test endpoint and QR-code endpoint were public. A headless Chrome (whatsapp-web.js) started on every boot. | WhatsApp and Africa's Talking code removed. Twilio is the only SMS provider. |
| H7 | `confirmLocation` with a missing token could match the first restaurant (TypeORM ignores `undefined` in `where`). | Token format is validated, and coordinates must be inside Rwanda. Tokens are single-use and expire after 24h. |
| H8 | Stored XSS on the recipient location page (sender name and package description rendered with `innerHTML`). | Output is HTML-escaped. |
| H9 | Restaurants could set any order status, including other restaurants' orders. | A restaurant can only move **its own food orders** through `confirmed/preparing/ready/cancelled`. |
| H10 | Paid webhooks set parcel orders to `confirmed`, which hid them from couriers. Payment-status polling never worked (PawaPay returns an array). | Fixed. Paid parcels keep their courier status, and polling now verifies correctly. |

### Medium / Low

- Responses no longer include PawaPay raw responses or token previews. Order creation logs no longer print full request bodies.
- `helmet` security headers. `x-powered-by` disabled. JSON body limit 200 KB.
- CORS is restricted to `FRONTEND_URL` + `CORS_ORIGINS` once they are set. Bearer tokens only, no cookies, so there is no CSRF exposure.
- Login timing does not reveal which accounts exist (bcrypt always runs). Minimum password lengths are enforced.
- Order IDs now carry 48 bits of cryptographic randomness. Location tokens use `crypto.randomUUID()`.
- Restaurant `passwordHash` and courier `password` columns are never selected by default, so they never appear in API responses.
- A deactivated staff user, courier or restaurant loses access immediately (the account is re-checked on every request).
- Dependencies: removed unused packages (socket.io, redis, schedule, moment, uuid, whatsapp-web.js, next-pwa). Upgraded bcrypt 6 (removes the vulnerable `tar`), nodemailer 10, Next.js 16.4.0. Pinned `qs` ≥ 6.16. The admin dashboard has **0** known vulnerabilities.
- Opening hours are evaluated in Kigali time (Render runs in UTC).

## 2. Residual risks (accepted, with reasons)

| Item | Why it is acceptable now | When to act |
|---|---|---|
| `npm audit` reports 10 moderate/high advisories in NestJS 10 transitive packages (multer, lodash via @nestjs/config, file-type, body-parser, uuid inside Nest). | Fixes require the NestJS 11 major upgrade. None of the vulnerable code paths are reachable: there are no file-upload routes, no lodash templates with user input, and no uuid v3/v5/v6 buffers. | Plan a NestJS 11 upgrade. |
| Customer orders are anonymous (no customer login). | The order ID acts as a tracking link and is unguessable. The order list endpoint is not public. | Add phone OTP login if customers need history across devices. |
| `synchronize: true` schema management. | All changes are additive and tested on a copy of the old schema (data kept, existing couriers remain approved). | Switch to migrations (`DB_SYNCHRONIZE=false`) before any destructive schema change. |
| Webhook IP and user-agent allow-list layer. | It is defence in depth only. Payment state changes are always verified with the PawaPay API. | Set `WEBHOOK_SECRET` and remove the user-agent layer once the forwarder sends the secret. |
| Free Render plan cold starts. | Functional, but the first request takes about 30–50s. | Move to the Starter plan before marketing launch. |
| Git remote URL in the local backend checkout contains a GitHub personal access token. | Stored only in the local `.git/config`, not in the repository. | Revoke that token on GitHub, create a new fine-grained token or use Git Credential Manager, and run `git remote set-url origin https://github.com/dacontent74-sudo/harakabackend.git`. |

## 3. Security measures in place (summary)

- **Authentication:** JWT (HS256) for staff, couriers and restaurants. bcrypt password hashing. The account is re-validated on every request.
- **Authorization:** role-based guards plus ownership checks (restaurant → own orders and earnings, courier → own jobs).
- **Payments:** server-side pricing. Every paid state is verified with the PawaPay API (status and amount). Idempotent webhooks. Admin overrides are audited.
- **Money out:** restaurant withdrawals are reviewed by an admin, reserved atomically, and paid with the PawaPay payouts API.
- **Abuse protection:** per-IP rate limiting with stricter limits on logins, orders and payments. Courier approval.
- **Transport and headers:** HTTPS (Render). Helmet headers. Restricted CORS.
- **Auditability:** staff logins, user changes and manual payment confirmations are written to `audit_logs` (Dashboard → Activity).
- **Secrets:** only in environment variables. `.env` is git-ignored. `.env.example` contains placeholders only.

## 4. How to verify

```bash
cd backend
node scripts/smoke-test.js      # every protected route must return 401; default admin password must be rejected
```
