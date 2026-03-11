// ============================================================
// index.js — Auth Worker main router
// QAcademy Nurses Hub — Phase 1 Auth
// Endpoints:
//   POST /login
//   POST /verify
//   POST /register
//   POST /reset/request
//   POST /reset/apply
// ============================================================

import { verifyPassword, hashPassword, generateSalt, generateUserId, generateUsernameFromForename, isValidUsername } from './password.js';
import { signJWT, verifyJWT, extractToken } from './jwt.js';
import { getUserByEmail, getUserById, getUserByUsername, getAllUsernames, usernameExists, getActiveSubscriptions, getAccessFromSubscriptions, createUser, createSubscription, updateLastLogin, getProductById, logAuthEvent, checkLoginRateLimit, createResetRequest, getResetRequestByToken, markResetUsed, updatePassword } from './db.js';
import { sendResetEmail, sendWelcomeSelfEmail } from './email.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

const LOGIN_URL = 'https://qacademy-alpha.pages.dev/login';
const RESET_URL = 'https://qacademy-alpha.pages.dev/reset-password';

function ok(data)    { return new Response(JSON.stringify({ ok: true,  ...data }), { headers: CORS }); }
function fail(error) { return new Response(JSON.stringify({ ok: false, error }),   { headers: CORS }); }

// ============================================================
export default {
  async fetch(request, env) {

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return fail('method_not_allowed');
    }

    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return fail('invalid_json');
    }

    const url      = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, '');
    const db       = env.DB;
    const secret   = env.JWT_SECRET;
    const resendKey = env.RESEND_API_KEY;


    // ============================================================
    // POST /login
    // ============================================================
    if (pathname === '/login') {
      const email    = (body.email    || '').trim().toLowerCase();
      const password = (body.password || '');
      const ua       = (body.ua       || '');
      const ip       = (body.ip       || request.headers.get('CF-Connecting-IP') || '');

      if (!email || !password) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, ok: false, error_code: 'missing_credentials' });
        return fail('missing_credentials');
      }

      const user = await getUserByEmail(db, email);

      const rl = await checkLoginRateLimit(db, email, user?.user_id || '', ip);
      if (rl.blocked) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user?.user_id || '', ok: false, error_code: rl.reason });
        return fail(rl.reason);
      }

      if (!user) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, ok: false, error_code: 'user_not_found' });
        return fail('user_not_found');
      }

      if (!user.active) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user.user_id, ok: false, error_code: 'user_inactive' });
        return fail('user_inactive');
      }

      if (user.expires_utc && new Date() >= new Date(user.expires_utc)) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user.user_id, ok: false, error_code: 'user_expired' });
        return fail('user_expired');
      }

      const passwordOk = await verifyPassword(user, password);
      if (!passwordOk) {
        await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user.user_id, ok: false, error_code: 'wrong_password' });
        return fail('wrong_password');
      }

      const subs   = await getActiveSubscriptions(db, user.user_id);
      const access = getAccessFromSubscriptions(subs);

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

      const token = await signJWT({ ...profile, access }, secret);
      const token_expires_utc = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

      await updateLastLogin(db, user.user_id);
      await logAuthEvent(db, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user.user_id, ok: true, error_code: 'ok' });

      return ok({ token, token_expires_utc, profile, login_via: 'email' });
    }


    // ============================================================
    // POST /verify
    // ============================================================
    if (pathname === '/verify') {
      const token = extractToken(request, body);
      if (!token) return fail('missing_token');

      const payload = await verifyJWT(token, secret);
      if (!payload) return fail('invalid_or_expired');

      const user = await getUserById(db, payload.user_id);
      if (!user)        return fail('user_missing');
      if (!user.active) return fail('user_inactive');
      if (user.expires_utc && new Date() >= new Date(user.expires_utc)) return fail('user_expired');

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
        user:    userOut,
        access,
        courses: access.courses,
        flags:   { is_admin: user.role?.toUpperCase() === 'ADMIN' }
      });
    }


    // ============================================================
    // POST /register
    // ============================================================
    if (pathname === '/register') {
      const forename      = (body.forename     || '').trim();
      const surname       = (body.surname      || '').trim();
      const email         = (body.email        || '').trim().toLowerCase();
      const password      = (body.password     || '');
      const phone_number  = (body.phone_number || '').trim();
      const program_id    = (body.program_id   || '').trim();
      const cohort        = (body.cohort       || '').trim();
      const usernameInput = (body.username     || '').trim().toLowerCase();

      if (!forename || !surname || !email || !password) return fail('missing_fields');
      if (password.length < 8) return fail('password_policy_failed');

      const existing = await getUserByEmail(db, email);
      if (existing) return fail('email_exists');

      let finalUsername = '';
      if (usernameInput) {
        if (!isValidUsername(usernameInput)) return fail('invalid_username');
        if (await usernameExists(db, usernameInput)) return fail('username_exists');
        finalUsername = usernameInput;
      } else {
        const existingUsernames = await getAllUsernames(db);
        finalUsername = generateUsernameFromForename(forename, existingUsernames);
      }

      const user_id = generateUserId();
      const salt    = await generateSalt();
      const hash    = await hashPassword(salt, password);
      const now     = new Date().toISOString();
      const name    = [forename, surname].filter(Boolean).join(' ');

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

      // Assign WELCOME_TRIAL subscription
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
        // Fail silently
      }

      // Send welcome email
      try {
        await sendWelcomeSelfEmail(resendKey, {
          to:       email,
          name:     forename,
          username: finalUsername,
          loginUrl: LOGIN_URL
        });
      } catch (e) {
        // Fail silently
      }

      return ok({ user_id, username: finalUsername, signup_via: 'self_register' });
    }


    // ============================================================
    // POST /reset/request
    // Body: { identifier } — email or username
    // ============================================================
    if (pathname === '/reset/request') {
      const identifier = (body.identifier || '').trim().toLowerCase();

      // Always return generic message — never reveal if account exists
      const genericResponse = ok({ message: 'If this account exists, a reset link has been sent.' });

      if (!identifier) return genericResponse;

      // Look up by email first, then username
      let user = await getUserByEmail(db, identifier);
      if (!user) user = await getUserByUsername(db, identifier);

      // No user or inactive — return generic response silently
      if (!user || !user.active) return genericResponse;

      // Generate reset token — UUID, 1hr expiry
      const resetToken  = crypto.randomUUID().replace(/-/g, '');
      const now         = new Date().toISOString();
      const expiresUtc  = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // Store in reset_requests
      try {
        await createResetRequest(db, {
          user_id:     user.user_id,
          email:       user.email,
          reset_token: resetToken,
          expires_utc: expiresUtc,
          created_utc: now
        });
      } catch (e) {
        return genericResponse;
      }

      // Build reset link
      const resetLink = `${RESET_URL}?rt=${encodeURIComponent(resetToken)}`;

      // Send email — fail silently
      try {
        const firstName = user.forename || user.name || '';
        await sendResetEmail(resendKey, {
          to:        user.email,
          name:      firstName,
          resetLink: resetLink
        });
      } catch (e) {
        // Fail silently — token is stored, user can retry
      }

      return genericResponse;
    }


    // ============================================================
    // POST /reset/apply
    // Body: { reset_token, new_password }
    // ============================================================
    if (pathname === '/reset/apply') {
      const resetToken   = (body.reset_token   || '').trim();
      const newPassword  = (body.new_password  || '');

      if (!resetToken)   return fail('missing_token');
      if (!newPassword)  return fail('missing_password');
      if (newPassword.length < 8) return fail('password_policy_failed');

      // Look up reset request
      const resetReq = await getResetRequestByToken(db, resetToken);
      if (!resetReq) return fail('invalid_token');

      // Check not already used
      if (resetReq.used) return fail('reset_expired');

      // Check not expired
      if (new Date() >= new Date(resetReq.expires_utc)) return fail('reset_expired');

      // Look up user
      const user = await getUserById(db, resetReq.user_id);
      if (!user)        return fail('user_missing');
      if (!user.active) return fail('user_inactive');

      // Generate new salt + hash
      const newSalt = await generateSalt();
      const newHash = await hashPassword(newSalt, newPassword);

      // Update password
      await updatePassword(db, user.user_id, newHash, newSalt);

      // Mark token as used
      await markResetUsed(db, resetToken);

      return ok({ message: 'password_updated' });
    }


    return fail('unknown_action');
  }
};
