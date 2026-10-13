/**
 * Restaurant opening hours, shared by the restaurant list (isOpen flag shown
 * in the apps) and order creation (closed restaurants cannot take orders).
 */

/** Current wall-clock time in the business time zone (Kigali by default). */
export function businessNow(): Date {
  const tz = process.env.BUSINESS_TIMEZONE || 'Africa/Kigali';
  try {
    return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  } catch {
    return new Date();
  }
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** hours: { monday: { open: '08:00', close: '22:00' }, ... } in local time. */
export function isOpenAt(hours: any, now: Date = businessNow()): boolean {
  if (!hours) return false;
  const todayHours = hours[DAYS[now.getDay()]];
  if (!todayHours || !todayHours.open || !todayHours.close) return false;

  const [openHour, openMin] = String(todayHours.open).split(':').map(Number);
  const [closeHour, closeMin] = String(todayHours.close).split(':').map(Number);
  const openTime = openHour * 60 + (openMin || 0);
  const closeTime = closeHour * 60 + (closeMin || 0);
  const currentTime = now.getHours() * 60 + now.getMinutes();
  if (!Number.isFinite(openTime) || !Number.isFinite(closeTime)) return false;

  return currentTime >= openTime && currentTime < closeTime;
}
