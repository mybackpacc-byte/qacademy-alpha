// ============================================================
// password.js — Crypto helpers
// Port of auth_core_utils.gs crypto functions
// Uses Web Crypto API (built into Cloudflare Workers)
// ============================================================

/**
 * SHA-256 hash of input string.
 * Returns web-safe base64 (no padding) — same as AppScript's
 * Utilities.base64EncodeWebSafe without trailing '='
 */
async function sha256WebSafe(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const base64 = btoa(String.fromCharCode(...hashArray));
  // Make web-safe: replace + with - and / with _, strip padding
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Hash password using salt + password as input.
 * Matches: _hashWebSafeSHA256(salt + password) in AppScript
 */
export async function hashPassword(salt, password) {
  return await sha256WebSafe(salt + password);
}

/**
 * Verify a plain password against a stored user row.
 * Matches: _verifyPassword(user, plain) in AppScript
 */
export async function verifyPassword(user, plainPassword) {
  if (!user || !user.salt || !user.password_hash) return false;
  const hash = await hashPassword(user.salt, plainPassword);
  return hash === user.password_hash;
}

/**
 * Generate a random salt — SHA-256 of a UUID, first 22 chars.
 * Matches: _generateSalt() in AppScript
 */
export async function generateSalt() {
  const uuid = crypto.randomUUID();
  const hash = await sha256WebSafe(uuid);
  return hash.slice(0, 22);
}

/**
 * Generate a user ID — U_ + 10 random hex chars.
 * Matches: _generateUserId_() in AppScript
 */
export function generateUserId() {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return 'U_' + uuid.slice(0, 10);
}

/**
 * Generate a random temp password — Qa- + 8 chars.
 * Matches: _randomTempPassword_() in AppScript
 */
export function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = 'Qa-';
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 8; i++) {
    out += chars[arr[i] % chars.length];
  }
  return out;
}

/**
 * Generate a unique username from a forename.
 * Matches: _generateUniqueUsernameFromForename_() in AppScript
 * Takes the forename, lowercases it, strips non-alphanumeric,
 * truncates to 15 chars, then appends a number if taken.
 */
export function generateUsernameFromForename(forename, existingUsernames = new Set()) {
  const base = forename
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 15) || 'user';

  if (!existingUsernames.has(base)) return base;

  for (let i = 2; i <= 9999; i++) {
    const suffix = i < 10 ? '0' + i : String(i);
    const candidate = (base + suffix).slice(0, 20);
    if (!existingUsernames.has(candidate)) return candidate;
  }

  throw new Error('could_not_generate_username');
}

/**
 * Validate username format.
 * Matches: _isValidUsername_() in AppScript
 * Must start with a letter, only lowercase letters/numbers/underscores, max 20 chars.
 */
export function isValidUsername(username) {
  return /^[a-z][a-z0-9_]{0,19}$/.test(String(username || ''));
}
