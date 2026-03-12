// ============================================================
// password.js — Username and user ID helpers
// QAcademy Nurses Hub
//
// NOTE: Password hashing and verification have been removed.
// Supabase Auth handles all password operations now.
//
// Kept: generateUserId, generateUsernameFromForename, isValidUsername
// ============================================================

/**
 * Generate a short unique user ID.
 * Format: U_ + 10 hex chars
 * Matches: _generateUserId_() in AppScript
 */
export function generateUserId() {
  return 'U_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

/**
 * Check if a username is valid.
 * Rules: starts with letter, lowercase letters/numbers/underscores only, max 20 chars.
 * Matches: _isValidUsername_() in AppScript
 */
export function isValidUsername(username) {
  return /^[a-z][a-z0-9_]{0,19}$/.test(String(username || ''));
}

/**
 * Generate a unique username from a forename.
 * e.g. "Akosua" -> "akosua", "akosua1", "akosua2" etc.
 * Matches: _generateUsername_() in AppScript
 */
export function generateUsernameFromForename(forename, existingUsernames) {
  const base = forename
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 15) || 'user';

  // Try base first
  if (!existingUsernames.has(base)) return base;

  // Try base + number
  for (let i = 1; i <= 9999; i++) {
    const candidate = base + i;
    if (!existingUsernames.has(candidate)) return candidate;
  }

  // Fallback — extremely unlikely to reach here
  return base + Date.now().toString().slice(-4);
}