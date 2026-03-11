// ============================================================
// index.js — Auth Worker main router
// QAcademy Nurses Hub — Phase 1 Auth
// Endpoints: POST /login | POST /verify | POST /register
// ============================================================

import { verifyPassword, hashPassword, generateSalt, generateUserId, generateUsernameFromForename, isValidUsername } from './password.js';
import { signJWT, verifyJWT, extractToken } from './jwt.js';
import { getUserByEmail, getUserById, getAllUsernames, usernameExists, getActiveSubscriptions, getAccessFromSubscriptions, createUser, createSubscription, updateLastLogin, getProductById, logAuthEvent, checkLoginRateLimit } from './db.js';

// CORS headers — allows your Pages frontend to call this Worker
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

function ok(data)    { return new Response(JSON.stringify({ ok: true,  ...data }), { headers: CORS }); }
function fail(error) { return new Response(JSON.stringify({ ok: false, error }),   { headers: CORS }); }

// ============================================================
export default {
  async fetch(request, env) {

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return fail('method_not_allowed');
    }

    // Parse body
    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return fail('invalid_json');
    }

    const url      = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, ''); // strip trailing slash
    const db       = env.DB;
    const secret   = env.JWT_SECRET;

    // ============================================================
    // POST /login
    // Body: { email, password, ua?, ip? }
    // ============================================================
    if (pathname === '/login') {
      const email    = (body.email    || '').trim().toLowerCase();
      const password = (body.password || '');
      const ua       = (body.ua       || '');
      const ip       = (body.ip       || request.headers.get('CF-Connecting-IP') || '');

      // 1) Validate fields
      if (!email || !password) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, ok: false, error_code: 'missing_credentials' });
        return fail('missing_credentials');
      }

      // 2) Look up user first (needed for rate limit)
      const user = await getUserByEmail(db, email);

      // 3) Rate limit check
      const rl = await checkLoginRateLimit(db, email, user?.user_id || '', ip);
      if (rl.blocked) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user?.user_id || '', ok: false, error_code: rl.reason });
        return fail(rl.reason);
      }

      // 4) User must exist
      if (!user) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, ok: false, error_code: 'user_not_found' });
        return fail('user_not_found');
      }

      // 5) User must be active
      if (!user.active) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user.user_id, ok: false, error_code: 'user_inactive' });
        return fail('user_inactive');
      }

      // 6) Check user-level expiry
      if (user.expires_utc && new Date() >= new Date(user.expires_utc)) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user.user_id, ok: false, error_code: 'user_expired' });
        return fail('user_expired');
      }

      // 7) Verify password
      const passwordOk = await verifyPassword(user, password);
      if (!passwordOk) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user.user_id, ok: false, error_code: 'wrong_password' });
        return fail('wrong_password');
      }

      // 8) Get subscriptions + access
      const subs   = await getActiveSubscriptions(db, user.user_id);
      const access = getAccessFromSubscriptions(subs);

      // 9) Build profile — same shape as AppScript
      const profile = {
        user_id:              user.user_id,
        username:             user.username,
        name:                 user.name || [user.forename, user.surname].filter(Boolean).join(' '),
        forename:             user.forename || '',
        surname:              user.surname  || '',
        email:                user.email,
        phone_number:         user.phone_number || '',
        program_id:           user.program_id   || '',
        cohort:               user.cohort        || '',
        level:                user.level         || '',
        avatar_url:           user.avatar_url    || '',
        role:                 user.role          || 'STUDENT',
        must_change_password: !!user.must_change_password,
        expires_utc:          user.expires_utc   || ''
      };

      // 10) Sign JWT
      const token = await signJWT({ ...profile, access }, secret);
      const token_expires_utc = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

      // 11) Update last login
      await updateLastLogin(db, user.user_id);

      // 12) Log success
      await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user.user_id, ok: true, error_code: 'ok' });

      return ok({ token, token_expires_utc, profile, login_via: 'email' });
    }


    // ============================================================
    // POST /verify
    // Header: Authorization: Bearer <token>  OR  Body: { token }
    // ============================================================
    if (pathname === '/verify') {
      const token = extractToken(request, body);

      if (!token) return fail('missing_token');

      // 1) Verify JWT signature + expiry
      const payload = await verifyJWT(token, secret);
      if (!payload) return fail('invalid_or_expired');

      // 2) Fresh user lookup — same as AppScript verify
      const user = await getUserById(db, payload.user_id);
      if (!user)        return fail('user_missing');
      if (!user.active) return fail('user_inactive');
      if (user.expires_utc && new Date() >= new Date(user.expires_utc)) return fail('user_expired');

      // 3) Fresh subscription + access
      const subs   = await getActiveSubscriptions(db, user.user_id);
      const access = getAccessFromSubscriptions(subs);

      const userOut = {
        user_id:              user.user_id,
        username:             user.username,
        name:                 user.name || [user.forename, user.surname].filter(Boolean).join(' '),
        forename:             user.forename || '',
        surname:              user.surname  || '',
        email:                user.email,
        phone_number:         user.phone_number || '',
        program_id:           user.program_id   || '',
        cohort:               user.cohort        || '',
        level:                user.level         || '',
        avatar_url:           user.avatar_url    || '',
        role:                 user.role          || 'STUDENT',
        must_change_password: !!user.must_change_password,
        expires_utc:          user.expires_utc   || ''
      };

      return ok({
        user:   userOut,
        access,
        courses: access.courses,
        flags: { is_admin: user.role?.toUpperCase() === 'ADMIN' }
      });
    }


    // ============================================================
    // POST /register
    // Body: { forename, surname, email, password, phone_number?, program_id?, cohort?, username? }
    // ============================================================
    if (pathname === '/register') {
      const forename     = (body.forename     || '').trim();
      const surname      = (body.surname      || '').trim();
      const email        = (body.email        || '').trim().toLowerCase();
      const password     = (body.password     || '');
      const phone_number = (body.phone_number || '').trim();
      const program_id   = (body.program_id   || '').trim();
      const cohort       = (body.cohort       || '').trim();
      const usernameInput = (body.username    || '').trim().toLowerCase();

      // 1) Required fields
      if (!forename || !surname || !email || !password) {
        return fail('missing_fields');
      }

      // 2) Password policy
      if (password.length < 8) {
        return fail('password_policy_failed');
      }

      // 3) Duplicate email check
      const existing = await getUserByEmail(db, email);
      if (existing) return fail('email_exists');

      // 4) Username — validate if provided, else generate from forename
      let finalUsername = '';
      if (usernameInput) {
        if (!isValidUsername(usernameInput)) return fail('invalid_username');
        if (await usernameExists(db, usernameInput)) return fail('username_exists');
        finalUsername = usernameInput;
      } else {
        const existingUsernames = await getAllUsernames(db);
        finalUsername = generateUsernameFromForename(forename, existingUsernames);
      }

      // 5) Generate credentials
      const user_id = generateUserId();
      const salt    = await generateSalt();
      const hash    = await hashPassword(salt, password);
      const now     = new Date().toISOString();
      const name    = [forename, surname].filter(Boolean).join(' ');

      // 6) Create user row
      await createUser(db, {
        user_id,
        username:      finalUsername,
        email,
        password_hash: hash,
        salt,
        name,
        forename,
        surname,
        phone_number,
        program_id,
        cohort,
        role:          'STUDENT',
        active:        1,
        must_change_password: 0,
        signup_source: 'SELF',
        created_utc:   now
      });

      // 7) Assign WELCOME_TRIAL subscription — same as AppScript
      try {
        const trialProduct = await getProductById(db, 'WELCOME_TRIAL');
        if (trialProduct) {
          const durationDays = trialProduct.duration_days || 7;
          const expires = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
          await createSubscription(db, {
            subscription_id: 'S_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10),
            user_id,
            product_id:  'WELCOME_TRIAL',
            kind:        'TRIAL',
            status:      'ACTIVE',
            start_utc:   now,
            expires_utc: expires,
            source:      'SYSTEM',
            created_utc: now
          });
        }
      } catch (e) {
        // Fail silently — same as AppScript. User is created regardless.
      }

      // 8) Return — NO auto-login, same as AppScript Option A
      return ok({
        user_id,
        username:    finalUsername,
        signup_via:  'self_register'
      });
    }

    // Unknown route
    return fail('unknown_action');
  }
};
