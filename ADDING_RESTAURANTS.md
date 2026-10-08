# Adding Real Restaurants

The production database has **no restaurants**. The three restaurants the customer app used to show (Heaven Restaurant, Repub Lounge, Meze Fresh) were a hard-coded fallback in the backend, with no menus behind them. That fallback has been removed, because customers must never be able to order from a restaurant that is not actually on Haraka.

> **Do not use the demo seed in production.** `POST /seed` creates restaurants with real Kigali business names, placeholder phone numbers and invented menus. It is blocked in production. If you really need it on a staging server, set `ALLOW_DEMO_SEED=true`.

## Onboarding a restaurant (about 10 minutes each)

You need from the restaurant: its name, category, area, a phone number that can receive SMS, opening hours, a logo or photo URL, and the menu with real prices.

1. **Create the restaurant.** Dashboard → **Restaurants** → **Add Restaurant**. Fill in name, category, location (for example "Kimihurura, Kigali"), phone (`07XXXXXXXX`), optional email, prep time and image URL. Leave GPS empty. The owner confirms it in step 3.
2. **Add the menu.** Open the restaurant → **Add Menu Item** for each dish: name, price in RWF, category, optional photo and description. Use **Mark out** for anything out of stock.
   - Customers are charged the **dashboard price**. The server recalculates every order from these prices.
3. **Confirm the GPS location.** On the restaurant page click **Send Location Link**. The owner gets an SMS (and email, if one is on file) with a link that works for 24 hours. They open it **while inside the restaurant** and tap *Confirm*. Delivery distance and price are measured from this point. Until it is confirmed, a central Kigali fallback point is used.
4. **Give them restaurant app access.** On the restaurant page → **Restaurant App Login** → **Generate** → **Set Password**. Copy the Restaurant ID and password, then send them to the owner privately (in person, or by WhatsApp to the verified owner).
5. **Install the Haraka Restaurant app** on the restaurant's phone and log in with that ID and password. Place a small test order from the customer app, and check that it appears and can be moved through *Accept → Preparing → Ready*.
6. **Opening hours.** The customer app shows *Open/Closed* from the restaurant's hours. Set them through the API until the dashboard form has an hours editor:
   ```bash
   curl -X PUT $API/merchants/<id> -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"hours":{"monday":{"open":"08:00","close":"22:00"},"tuesday":{"open":"08:00","close":"22:00"},"wednesday":{"open":"08:00","close":"22:00"},"thursday":{"open":"08:00","close":"22:00"},"friday":{"open":"08:00","close":"23:00"},"saturday":{"open":"09:00","close":"23:00"},"sunday":{"open":"10:00","close":"21:00"}}}'
   ```
   Enter times in **Kigali local time**. The backend compares them with Kigali time (`BUSINESS_TIMEZONE`, default `Africa/Kigali`), even though Render's clock runs in UTC. A day with no hours counts as closed.

## Adding many restaurants at once (API)

```bash
API=https://harakabackend.onrender.com/api/v1
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"<admin email>","password":"<password>"}' | jq -r .token)

# Restaurant (password is optional: it sets the restaurant app login)
curl -X POST $API/merchants -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "name": "Example Kitchen", "category": "Rwandan", "location": "Kicukiro, Kigali",
  "phone": "0788000000", "email": "owner@example.rw", "prepTime": 20,
  "image": "https://...", "description": "Home-style brochettes and isombe",
  "password": "a-strong-password"
}'

# Menu item
curl -X POST $API/merchants/<id>/menu -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "name": "Beef Brochettes", "price": 3500, "category": "Grill", "isPopular": true
}'
```

## Restaurant money flow

- A restaurant earns the **food subtotal** of each order that is *delivered* and *paid*. Delivery and service fees go to the courier and Haraka.
- The restaurant requests a withdrawal in its app. The amount is reserved at once.
- An admin opens Dashboard → **Payouts** and either clicks **Pay via PawaPay** (a Mobile Money payout to the number given) or **Mark paid** with a reference if the payment was made another way. **Reject** returns the amount to the restaurant's balance.
- PawaPay payouts need payouts enabled on your PawaPay account and enough float in the payout wallet.
