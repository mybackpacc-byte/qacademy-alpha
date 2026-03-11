// ============================================================
// db.js — D1 query helpers
// Port of sheet helper functions from auth_core_domain.gs
// All functions take db (env.DB) as first argument
// ============================================================

/**
 * Get a user by email.
 * Matches: _getUserByEmail() in AppScript
 */
export async function getUserByEmail(db, email) {
  const result = await db.prepare(
    'SELECT * FROM users WHERE LOWER(email) = LOWER(?1) LIMIT 1'
  ).bind(email.trim()).first();
  return result || null;
}

/**
 * Get a user by user_id.
 * Matches: _getUserById() in AppScript
 */
export async function getUserById(db, userId) {
  const result = await db.prepare(
    'SELECT * FROM users WHERE user_id = ?1 LIMIT 1'
  ).bind(userId.trim()).first();
  return result || null;
}

/**
 * Get a user by username.
 * Matches: _getUserByUsername() in AppScript
 */
export async function getUserByUsername(db, username) {
  const result = await db.prepare(
    'SELECT * FROM users WHERE LOWER(username) = LOWER(?1) LIMIT 1'
  ).bind(username.trim()).first();
  return result || null;
}

/**
 * Check if a username already exists.
 * Used during registration to avoid duplicates.
 */
export async function usernameExists(db, username) {
  const result = await db.prepare(
    'SELECT user_id FROM users WHERE LOWER(username) = LOWER(?1) LIMIT 1'
  ).bind(username.trim()).first();
  return !!result;
}

/**
 * Get all existing usernames.
 * Used during registration to generate a unique username.
 */
export async function getAllUsernames(db) {
  const result = await db.prepare(
    'SELECT username FROM users WHERE username IS NOT NULL'
  ).all();
  return new Set((result.results || []).map(r => r.username.toLowerCase()));
}

/**
 * Get active, unexpired subscriptions for a user.
 * Joins subscriptions + products to get courses_included.
 * Matches: _getActiveSubscriptionsForUser() in AppScript
 */
export async function getActiveSubscriptions(db, userId) {
  const now = new Date().toISOString();
  const result = await db.prepare(`
    SELECT
      s.subscription_id,
      s.product_id,
      s.kind,
      s.status,
      s.start_utc,
      s.expires_utc,
      p.name        AS product_name,
      p.courses_included
    FROM subscriptions s
    LEFT JOIN products p ON s.product_id = p.product_id
    WHERE s.user_id = ?1
      AND s.status = 'ACTIVE'
      AND (s.expires_utc = '' OR s.expires_utc > ?2)
    ORDER BY s.expires_utc DESC
  `).bind(userId, now).all();

  return result.results || [];
}

/**
 * Derive course access from active subscriptions.
 * Matches: _getAccessFromSubscriptions() in AppScript
 * Returns { product_ids, kinds, courses }
 */
export function getAccessFromSubscriptions(subs) {
  const productIds = [];
  const kinds = [];
  const courseSet = new Set();

  for (const s of subs) {
    if (s.product_id) productIds.push(s.product_id);
    if (s.kind) kinds.push(s.kind);

    if (s.courses_included) {
      s.courses_included
        .split(/[\s,]+/)
        .map(c => c.trim().toUpperCase())
        .filter(Boolean)
        .forEach(c => courseSet.add(c));
    }
  }

  return {
    product_ids: [...new Set(productIds)],
    kinds:       [...new Set(kinds)],
    courses:     [...courseSet],
    has_paid:    kinds.includes('PAID'),
    has_trial:   kinds.includes('TRIAL'),
    has_free:    kinds.includes('FREE')
  };
}

/**
 * Insert a new user row.
 * Matches: _appendObj(sh, headers, obj) for users in AppScript
 */
export async function createUser(db, user) {
  await db.prepare(`
    INSERT INTO users (
      user_id, username, email, password_hash, salt,
      name, forename, surname, phone_number,
      program_id, cohort, role, active,
      must_change_password, signup_source,
      created_utc, updated_utc
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5,
      ?6, ?7, ?8, ?9,
      ?10, ?11, ?12, ?13,
      ?14, ?15,
      ?16, ?16
    )
  `).bind(
    user.user_id,
    user.username,
    user.email,
    user.password_hash,
    user.salt,
    user.name,
    user.forename,
    user.surname,
    user.phone_number  || '',
    user.program_id    || '',
    user.cohort        || '',
    user.role          || 'STUDENT',
    user.active        ?? 1,
    user.must_change_password ?? 0,
    user.signup_source || 'SELF',
    user.created_utc
  ).run();
}

/**
 * Update last_login_utc for a user.
 * Matches: obj.last_login_utc = _iso(_now()) in AppScript
 */
export async function updateLastLogin(db, userId) {
  const now = new Date().toISOString();
  await db.prepare(
    'UPDATE users SET last_login_utc = ?1, updated_utc = ?1 WHERE user_id = ?2'
  ).bind(now, userId).run();
}

/**
 * Create a subscription row.
 * Matches: _appendObj(sh, headers, obj) for subscriptions in AppScript
 */
export async function createSubscription(db, sub) {
  await db.prepare(`
    INSERT INTO subscriptions (
      subscription_id, user_id, product_id, kind,
      status, start_utc, expires_utc,
      source, created_utc, updated_utc
    ) VALUES (
      ?1, ?2, ?3, ?4,
      ?5, ?6, ?7,
      ?8, ?9, ?9
    )
  `).bind(
    sub.subscription_id,
    sub.user_id,
    sub.product_id,
    sub.kind        || 'TRIAL',
    sub.status      || 'ACTIVE',
    sub.start_utc,
    sub.expires_utc,
    sub.source      || 'SYSTEM',
    sub.created_utc
  ).run();
}

/**
 * Get a product by product_id.
 * Matches: _getProductById() in AppScript
 */
export async function getProductById(db, productId) {
  const result = await db.prepare(
    'SELECT * FROM products WHERE product_id = ?1 LIMIT 1'
  ).bind(productId.trim().toUpperCase()).first();
  return result || null;
}

/**
 * Log an auth event.
 * Matches: _logAuthEvent_() in AppScript
 * Never throws — errors are swallowed so login flow is never blocked.
 */
export async function logAuthEvent(db, event) {
  try {
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO auth_events (
        kind, identifier, user_id,
        ip_hash, ua_hash,
        ok, error_code, note, created_utc
      ) VALUES (
        ?1, ?2, ?3,
        ?4, ?5,
        ?6, ?7, ?8, ?9
      )
    `).bind(
      event.kind        || '',
      event.identifier  || '',
      event.user_id     || '',
      event.ip_hash     || '',
      event.ua_hash     || '',
      event.ok ? 1 : 0,
      event.error_code  || '',
      event.note        || '',
      now
    ).run();
  } catch (e) {
    // Fail silently — same behaviour as AppScript version
  }
}

/**
 * Check login rate limit.
 * Two windows — same as _checkLoginRateLimit_() in AppScript:
 *   Short: 5 failures in 10 minutes
 *   Long:  10 failures in 24 hours
 */
export async function checkLoginRateLimit(db, identifier, userId, ip) {
  try {
    const now = new Date();
    const cutoffShort = new Date(now - 10 * 60 * 1000).toISOString();
    const cutoffLong  = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // Count recent failures by identifier OR user_id OR ip_hash
    const ipHash = ip ? await hashStr(ip) : '';

    const shortResult = await db.prepare(`
      SELECT COUNT(*) as cnt FROM auth_events
      WHERE ok = 0
        AND created_utc >= ?1
        AND (identifier = ?2 OR user_id = ?3 OR ip_hash = ?4)
    `).bind(cutoffShort, identifier || '', userId || '', ipHash).first();

    const longResult = await db.prepare(`
      SELECT COUNT(*) as cnt FROM auth_events
      WHERE ok = 0
        AND created_utc >= ?1
        AND (identifier = ?2 OR user_id = ?3 OR ip_hash = ?4)
    `).bind(cutoffLong, identifier || '', userId || '', ipHash).first();

    const shortCount = shortResult?.cnt || 0;
    const longCount  = longResult?.cnt  || 0;

    if (longCount >= 10) return { blocked: true, reason: 'too_many_attempts_24h' };
    if (shortCount >= 5) return { blocked: true, reason: 'too_many_attempts' };

    return { blocked: false };

  } catch (e) {
    // If rate limit check fails, allow through — same as AppScript
    return { blocked: false };
  }
}

/**
 * Internal hash helper for IP hashing in rate limit.
 */
async function hashStr(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const base64 = btoa(String.fromCharCode(...hashArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
