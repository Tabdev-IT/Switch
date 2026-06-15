/** Libyan mobile operators: 091, 092, 093, 094 → local format 09XXXXXXXX */
const LIBYAN_MOBILE_OPERATORS = new Set(['91', '92', '93', '94']);

/**
 * Strip country/leading prefixes → 9-digit core (93xxxxxxx).
 * Accepts +21893…, 0021893…, 21893…, 093…, 93…
 * Mirrors tab-backend FormatPhone.
 */
function FormatPhone(phone) {
  if (phone == null) return false;
  let p = String(phone).replace(/\s+/g, '').trim();
  if (!p) return false;
  if (p.startsWith('09')) p = p.substring(1);
  if (p.startsWith('00218')) p = p.substring(5);
  if (p.startsWith('218')) p = p.substring(3);
  if (p.startsWith('+218')) p = p.substring(4);
  return p;
}

/**
 * Normalize phone for SMS and contact APIs.
 * Uses FormatPhone, validates 91|92|93|94 operator, returns 0-prefixed local number.
 * Mirrors tab-backend FormatContactNumber.
 */
function FormatContactNumber(phone) {
  const raw = String(phone ?? '')
    .replace(/\s+/g, '')
    .trim();
  if (!raw) return '';
  const cleaned = FormatPhone(raw);
  if (!cleaned || typeof cleaned !== 'string') return '';
  if (cleaned.length !== 9 || !cleaned.startsWith('9')) return '';
  const operator = cleaned.slice(0, 2);
  if (!LIBYAN_MOBILE_OPERATORS.has(operator)) return '';
  return `0${cleaned}`;
}

/**
 * Resolve recipient from webhook/API payload field names.
 */
function extractPhoneFromPayload(data) {
  if (!data || typeof data !== 'object') return null;
  return data.phone ?? data.phoneNumber ?? data.mobile ?? data.msisdn ?? null;
}

/**
 * Format for SMPP routing (0-prefixed local Libyan mobile).
 */
function formatPhoneForSmpp(phone) {
  const local = FormatContactNumber(phone);
  return local || null;
}

module.exports = {
  LIBYAN_MOBILE_OPERATORS,
  FormatPhone,
  FormatContactNumber,
  extractPhoneFromPayload,
  formatPhoneForSmpp
};
