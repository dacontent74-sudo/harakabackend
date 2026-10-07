/**
 * Input Validation Utilities
 * Security-critical validation functions
 */

/**
 * Validate Rwanda phone number format
 * Accepts: +250788123456, 250788123456, 0788123456, 788123456
 * Returns: Normalized +250788123456 format or throws error
 */
export function validateAndNormalizePhone(phone: string): string {
  if (!phone) {
    throw new Error('Phone number is required');
  }

  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Check for various valid formats
  let normalized: string;

  if (cleaned.startsWith('+250')) {
    // Already in +250 format
    normalized = cleaned;
  } else if (cleaned.startsWith('250')) {
    // 250 format
    normalized = '+' + cleaned;
  } else if (cleaned.startsWith('0')) {
    // 0788... format
    normalized = '+250' + cleaned.substring(1);
  } else if (cleaned.length === 9) {
    // 788... format
    normalized = '+250' + cleaned;
  } else {
    throw new Error('Invalid phone number format. Expected Rwanda number (+250)');
  }

  // Validate final format: +250 followed by 9 digits
  const regex = /^\+250\d{9}$/;
  if (!regex.test(normalized)) {
    throw new Error('Invalid phone number. Must be Rwanda number with 9 digits after +250');
  }

  return normalized;
}

/**
 * Validate GPS coordinates
 * Latitude: -90 to 90
 * Longitude: -180 to 180
 * Rwanda approx: lat -3 to -1, lng 28 to 31
 */
export function validateGPSCoordinates(
  latitude: number | string,
  longitude: number | string,
  strict: boolean = false
): { lat: number; lng: number } {
  const lat = typeof latitude === 'string' ? parseFloat(latitude) : latitude;
  const lng = typeof longitude === 'string' ? parseFloat(longitude) : longitude;

  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Invalid GPS coordinates: must be numbers');
  }

  // Basic validation (any location on Earth)
  if (lat < -90 || lat > 90) {
    throw new Error('Invalid latitude: must be between -90 and 90');
  }

  if (lng < -180 || lng > 180) {
    throw new Error('Invalid longitude: must be between -180 and 180');
  }

  // Strict validation (Rwanda region only)
  if (strict) {
    if (lat < -3 || lat > -1) {
      throw new Error('Latitude outside Rwanda region (-3 to -1)');
    }

    if (lng < 28 || lng > 31) {
      throw new Error('Longitude outside Rwanda region (28 to 31)');
    }
  }

  return { lat, lng };
}

/**
 * Validate order amount
 * Ensures positive number within reasonable range
 */
export function validateAmount(amount: number | string): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(num)) {
    throw new Error('Invalid amount: must be a number');
  }

  if (num <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  if (num > 10000000) {
    // 10 million RWF max (reasonable limit)
    throw new Error('Amount exceeds maximum limit');
  }

  return num;
}

/**
 * Validate order ID format
 * Expected: HRK{timestamp}{random}
 */
export function validateOrderId(orderId: string): string {
  if (!orderId || typeof orderId !== 'string') {
    throw new Error('Order ID is required');
  }

  if (orderId.length < 10 || orderId.length > 50) {
    throw new Error('Invalid order ID length');
  }

  // Basic format check (starts with HRK for Haraka orders)
  if (!orderId.startsWith('HRK')) {
    throw new Error('Invalid order ID format');
  }

  return orderId;
}

/**
 * Validate deposit ID (UUID format from PawaPay)
 */
export function validateDepositId(depositId: string): string {
  if (!depositId || typeof depositId !== 'string') {
    throw new Error('Deposit ID is required');
  }

  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(depositId)) {
    throw new Error('Invalid deposit ID format (expected UUID)');
  }

  return depositId;
}

/**
 * Sanitize string for safe display
 * Prevents XSS attacks
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate email format
 */
export function validateEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    throw new Error('Email is required');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }

  return email.toLowerCase().trim();
}
