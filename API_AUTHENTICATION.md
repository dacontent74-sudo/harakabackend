# Haraka API Authentication

Base URL: `https://harakabackend.onrender.com/api/v1`

Every request that changes data, or reads private data, needs a **JWT bearer token**:

```
Authorization: Bearer <token>
```

There are three kinds of account. All tokens are signed with the same `JWT_SECRET` (HS256). The `type` claim says which kind of account the token belongs to.

| Who | Logs in with | Endpoint | Token `type` | Lifetime |
|---|---|---|---|---|
| Staff (admin dashboard) | email + password | `POST /auth/login` | `staff` | 12h (`JWT_STAFF_EXPIRES_IN`) |
| Courier (courier app) | phone + password | `POST /couriers/login` | `courier` | 30d (`JWT_COURIER_EXPIRES_IN`) |
| Restaurant (restaurant app) | restaurant ID or phone + password | `POST /merchants/auth/login` | `merchant` | 30d (`JWT_MERCHANT_EXPIRES_IN`) |

Customers do not log in. The customer app uses only the public endpoints listed below. Order IDs are long and random, so knowing an ID works like a tracking link.

## How a request is checked

1. `JwtAuthGuard` checks the signature (HS256 only), the expiry and the `type` claim.
2. `JwtStrategy` loads the account from the database **on every request**. If a staff user, courier or restaurant has been deactivated, their token stops working at once, even if it has not expired yet. A courier who is not yet approved is also rejected.
3. `RolesGuard` checks that the account's role is allowed on that route. Couriers have role `courier` and restaurants have role `merchant`.
4. Ownership checks happen inside the handlers:
   - A restaurant can only see and change **its own** orders, earnings and withdrawals.
   - A courier can only update, or collect payment for, jobs **assigned to them**.

Responses:
- `401 Unauthorized`: the token is missing, invalid or expired, or the account is inactive.
- `403 Forbidden`: the account is valid but not allowed to do this.
- `429 Too Many Requests`: the rate limit was hit.

Routes are protected with the `@Auth(...roles)` decorator (`src/auth/decorators/roles.decorator.ts`). The role groups are defined in `src/auth/principal.ts`:

| Group | Roles |
|---|---|
| `STAFF_ALL` | super_admin, admin, manager, support, viewer |
| `STAFF_WRITE` | super_admin, admin, manager |
| `STAFF_ADMIN` | super_admin, admin |

## Endpoint access matrix

### Public (no token)
| Method | Path | Notes |
|---|---|---|
| GET | `/health` (no `/api/v1` prefix) | Liveness check plus a database check |
| GET | `/merchants`, `/merchants/:id`, `/merchants/:id/menu` | Restaurant catalogue |
| GET | `/pricing/calculate`, `/pricing/rates` | Delivery price |
| POST | `/orders` | Create a food or parcel order. **The server recomputes every price.** 10/min per IP |
| POST | `/orders/pending` | Parcel order that waits for the recipient's location. 10/min |
| PUT | `/orders/:id/delivery-location` | Recipient link. Only works before the order is confirmed |
| GET | `/orders/:id` | Track one order |
| POST | `/orders/lookup` | `{ ids: [...] }`. The customer app's order history |
| POST | `/payments/initiate` | Start a Mobile Money payment. 10/min |
| GET | `/payments/status/:depositId` | Poll payment status. Verified with PawaPay |
| POST | `/payments/webhooks/pawapay` | PawaPay callback (see "Payment webhook" below) |
| POST | `/merchants/location/confirm` | Restaurant GPS confirmation. Needs a single-use 24h token |
| GET | `/confirm-location`, `/select-location/:orderId` | Public HTML pages |
| POST | `/auth/login` | Staff login. 5/min |
| POST | `/couriers/register` | 5/min. New couriers need approval |
| POST | `/couriers/login` | 10/min |
| POST | `/merchants/auth/login` | Restaurant login. 5/min |

### Restaurant token (`merchant`)
| Method | Path |
|---|---|
| GET | `/merchants/me`, `/merchants/me/withdrawals` |
| GET | `/orders`: only this restaurant's food orders |
| PUT | `/orders/:id/status`: own orders only. Allowed statuses: `confirmed`, `preparing`, `ready`, `cancelled` (cancel only before `ready`) |
| GET | `/merchants/:id/earnings`: own restaurant only (`:id` = ID or name) |
| POST | `/merchants/:id/withdraw`: creates a withdrawal request that an admin pays out |

### Courier token (`courier`)
| Method | Path |
|---|---|
| GET | `/couriers/available-jobs`, `/couriers/active-jobs`, `/couriers/history`, `/couriers/earnings`, `/couriers/profile` |
| POST | `/couriers/accept-job/:orderId`: atomic, so only one courier can win a job |
| PUT | `/couriers/update-status/:orderId`: own jobs only. `arrived_at_pickup` → `picked_up` → `delivered` |
| POST | `/couriers/update-location` |
| PUT | `/couriers/profile` |
| POST | `/payments/collect-receiver`: own job only, when the receiver pays |

### Staff token
| Method | Path | Roles |
|---|---|---|
| GET | `/orders` (all), `/couriers`, `/merchants/:id/location/status`, `/merchants/withdrawals/all`, `/merchants/:id/earnings` | STAFF_ALL |
| PUT | `/orders/:id/status` | STAFF_WRITE (+ restaurant) |
| POST/PUT | `/merchants`, `/merchants/:id`, `/merchants/:id/menu`, `/merchants/menu/:itemId` | STAFF_WRITE |
| DELETE | `/merchants/menu/:itemId` | STAFF_WRITE |
| POST | `/merchants/:id/location/send-link` | STAFF_WRITE |
| PUT | `/couriers/:id/approval` | STAFF_WRITE |
| DELETE | `/merchants/:id` | STAFF_ADMIN |
| PUT | `/merchants/:id/password` (set restaurant app password) | STAFF_ADMIN |
| PUT | `/merchants/withdrawals/:id` (`payout` / `mark_paid` / `reject` / `refresh`) | STAFF_ADMIN |
| POST | `/payments/manual-confirm/:depositId` | STAFF_ADMIN. Checked with PawaPay first; only `super_admin` can force it |
| POST | `/payments/debug` | STAFF_ADMIN, and disabled in production |
| GET | `/auth/users` / POST `/auth/register` | STAFF_ADMIN. Only a super_admin can create admins |
| PUT/DELETE | `/auth/users/:id` | super_admin |
| GET | `/auth/audit-logs` | super_admin, admin, manager |
| GET | `/auth/me`, POST `/auth/change-password` | any staff |
| POST | `/seed` (no prefix) | super_admin |

## Examples

```bash
API=https://harakabackend.onrender.com/api/v1

# Staff
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@haraka.rw","password":"<password>"}' | jq -r .token)
curl -H "Authorization: Bearer $TOKEN" $API/orders

# Restaurant (password set by an admin on the restaurant page)
curl -X POST $API/merchants/auth/login -H 'Content-Type: application/json' \
  -d '{"restaurantId":"4","password":"<password>"}'

# Courier
curl -X POST $API/couriers/login -H 'Content-Type: application/json' \
  -d '{"phoneNumber":"0788123456","password":"<password>"}'
```

## Payment webhook

`POST /payments/webhooks/pawapay` has two layers of protection:

1. **Source check** (`WebhookGuard`). The request must carry the shared secret (`X-Webhook-Secret` header or `?secret=` equal to `WEBHOOK_SECRET`), or come from a whitelisted IP (`WEBHOOK_ALLOWED_IPS`), or have a known forwarder user-agent.
2. **Independent verification.** The backend ignores the status in the payload. It asks the PawaPay API (`GET /deposits/{id}`, using our API token) for the real status and amount. An order is marked **paid** only when PawaPay itself reports `COMPLETED` for at least the order total. A forged webhook can therefore only trigger a harmless re-check.

## Account lifecycle

| Action | How |
|---|---|
| First super admin | Created at startup if none exists, using `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD`. If no password is set, a random one is generated and logged once |
| Change own password | Dashboard → user menu → **Change password** (`POST /auth/change-password`) |
| Add staff | Dashboard → Staff (`POST /auth/register`) |
| Restaurant app access | Dashboard → Restaurant → **Restaurant App Login** → Set Password |
| Approve courier | Dashboard → Couriers → Courier Accounts → **Approve** |
| Revoke access | Deactivate the staff user, courier or restaurant. Its tokens stop working immediately |
| Revoke **all** tokens | Change `JWT_SECRET` on Render. Everyone must log in again |

Passwords are hashed with bcrypt (10 rounds). Staff and restaurant passwords need at least 8 characters, courier passwords at least 6. Logins always run bcrypt, so response timing does not reveal which accounts exist.

## Code map

```
src/auth/jwt.config.ts          JWT secret handling (no hard-coded fallback in production) + lifetimes
src/auth/principal.ts           Principal types, role groups
src/auth/token.service.ts       Issues staff/courier/merchant tokens
src/auth/strategies/jwt.strategy.ts  Validates tokens, reloads the account from the DB
src/auth/guards/*.ts            JwtAuthGuard, RolesGuard
src/auth/decorators/roles.decorator.ts  @Auth(...roles), @CurrentUser()
```

## Testing

```bash
# Read-only check of the deployed API: health, public routes, every protected route returns 401
node scripts/smoke-test.js
BASE_URL=http://localhost:3000 node scripts/smoke-test.js
ADMIN_EMAIL=admin@haraka.rw ADMIN_PASSWORD='...' node scripts/smoke-test.js   # also checks staff login
```
