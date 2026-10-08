#!/usr/bin/env node
/**
 * Post-deploy smoke test (read-only, creates no data).
 *
 *   node scripts/smoke-test.js                       # tests https://harakabackend.onrender.com
 *   BASE_URL=http://localhost:3000 node scripts/smoke-test.js
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/smoke-test.js   # also checks staff login
 *
 * Verifies: health, public endpoints, and that every protected endpoint
 * rejects requests without a valid token (HTTP 401).
 */
const BASE = (process.env.BASE_URL || 'https://harakabackend.onrender.com').replace(/\/+$/, '');
const API = `${BASE}/api/v1`;

let passed = 0;
let failed = 0;

async function call(method, url, { token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, data };
}

function report(ok, name, detail) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (${detail})`}`);
}

(async () => {
  console.log(`Haraka smoke test against ${BASE}\n`);

  // Render free tier may need ~50s to wake up.
  const health = await call('GET', `${BASE}/health`);
  report(health.status === 200 && health.data?.database === 'ok', 'GET /health (database ok)', JSON.stringify(health.data));

  const merchants = await call('GET', `${API}/merchants`);
  report(merchants.status === 200 && Array.isArray(merchants.data?.data), 'GET /merchants is public', merchants.status);
  if (Array.isArray(merchants.data?.data)) {
    console.log(`      -> ${merchants.data.data.length} active restaurant(s)`);
  }

  const pricing = await call('GET', `${API}/pricing/calculate?distance=4&vehicle=motorcycle`);
  report(pricing.status === 200, 'GET /pricing/calculate is public', pricing.status);

  const protectedRoutes = [
    ['GET', '/orders'],
    ['PUT', '/orders/TEST/status'],
    ['POST', '/merchants'],
    ['PUT', '/merchants/1'],
    ['DELETE', '/merchants/1'],
    ['POST', '/merchants/1/menu'],
    ['PUT', '/merchants/menu/1'],
    ['DELETE', '/merchants/menu/1'],
    ['GET', '/merchants/1/earnings'],
    ['POST', '/merchants/1/withdraw'],
    ['POST', '/merchants/1/location/send-link'],
    ['GET', '/merchants/withdrawals/all'],
    ['GET', '/couriers'],
    ['GET', '/couriers/available-jobs'],
    ['POST', '/couriers/accept-job/TEST'],
    ['PUT', '/couriers/update-status/TEST'],
    ['POST', '/payments/manual-confirm/TEST'],
    ['POST', '/payments/collect-receiver'],
    ['GET', '/auth/users'],
    ['POST', '/auth/register'],
  ];
  for (const [method, path] of protectedRoutes) {
    const r = await call(method, `${API}${path}`, { body: method === 'GET' ? undefined : {} });
    report(r.status === 401, `${method} ${path} requires auth`, `got HTTP ${r.status}`);
  }
  const seed = await call('POST', `${BASE}/seed`);
  report(seed.status === 401, 'POST /seed requires auth', `got HTTP ${seed.status}`);

  const legacy = await call('GET', `${API}/couriers/active-jobs`, { token: 'courier_1_1700000000000' });
  report(legacy.status === 401, 'legacy fake courier token rejected', `got HTTP ${legacy.status}`);

  const defaultAdmin = await call('POST', `${API}/auth/login`, { body: { email: 'admin@haraka.rw', password: 'admin123' } });
  report(!defaultAdmin.data?.token, 'default admin password (admin123) is NOT accepted', 'CHANGE THE ADMIN PASSWORD NOW');

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const login = await call('POST', `${API}/auth/login`, {
      body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
    });
    report(login.status === 200 && !!login.data?.token, 'staff login works', login.status);
    if (login.data?.token) {
      const orders = await call('GET', `${API}/orders`, { token: login.data.token });
      report(orders.status === 200, 'staff can list orders with token', orders.status);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('Smoke test crashed:', e.message);
  process.exit(1);
});
