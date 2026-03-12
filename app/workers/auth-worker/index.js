// ============================================================
// index.js — Auth Worker main router
// QAcademy Nurses Hub — Phase 1 Auth (Supabase)
// Endpoints:
//   POST /login
//   POST /verify
//   POST /register
//   POST /reset/request
//   POST /reset/apply
// ============================================================

import { generateUsernameFromForename, isValidUsername, generateUserId } from './password.js';
import { getSupabaseClient, getUserByEmail, getUserById, getUserByUsername, getUserBySupabaseUid, getAllUsernames, usernameExists, getActiveSubscriptions, getAccessFromSubscriptions, createUser, createSubscription, updateLastLogin, getProductById, logAuthEvent, checkLoginRateLimit, createResetRequest, updatePassword } from './db.js';
import { sendWelcomeSelfEmail } from './email.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

const LOGIN_URL = 'https://qacademy-alpha.pages.dev/login';

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

    // Supabase client — created fresh per request using service role key
    const supabase  = getSupabaseClient(env);
    const resendKey = env.RESEND_API_KEY;


    // ============================================================
    // POST /login
    // Body: { email, password, ua?, ip? }
    // ============================================================
    if (pathname === '/login') {
      const email    = (body.email    || '').trim().toLowerCase();
      const password = (body.password || '');
      const ua       = (body.ua       || '');
      const ip       = (body.ip       || request.headers.get('CF-Connecting-IP') || '');

      if (!email || !password) {
        await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, ok: false, error_code: 'missing_credentials' });
        return fail('missing_credentials');
      }

      // Rate limit check before attempting login
      const user = await getUserByEmail(supabase, email).catch(() => null);
      const rl   = await checkLoginRateLimit(supabase, email, user?.user_id || '', ip);
      if (rl.blocked) {
        await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user?.user_id || '', ok: false, error_code: rl.reason });
        return fail(rl.reason);
      }

      // Supabase Auth — handles password verification
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError || !authData?.user) {
        await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, ok: false, error_code: 'invalid_login' });
        return fail('invalid_login');
      }

      // Fetch profile from public.users
      const profile = await getUserBySupabaseUid(supabase, authData.user.id);

      if (!profile) {
        await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, ok: false, error_code: 'user_missing' });
        return fail('user_missing');
      }

      if (!profile.active) {
        await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, user_id: profile.user_id, ok: false, error_code: 'user_inactive' });
        return fail('user_inactive');
      }

      if (profile.expires_utc && new Date() >= new Date(profile.expires_utc)) {
        await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, user_id: profile.user_id, ok: false, error_code: 'user_expired' });
        return fail('user_expired');
      }

      const subs   = await getActiveSubscriptions(supabase, profile.user_id);
      const access = getAccessFromSubscriptions(subs);

      const userOut = {
        user_id:              profile.user_id,
        username:             profile.username,
        name:                 profile.name || [profile.forename, profile.surname].filter(Boolean).join(' '),
        forename:             profile.forename     || '',
        surname:              profile.surname      || '',
        email:                profile.email,
        phone_number:         profile.phone_number || '',
        program_id:           profile.program_id   || '',
        cohort:               profile.cohort       || '',
        level:                profile.level        || '',
        avatar_url:           profile.avatar_url   || '',
        role:                 profile.role         || 'STUDENT',
        must_change_password: !!profile.must_change_password,
        expires_utc:          profile.expires_utc  || ''
      };

      // Use Supabase's JWT — no custom signing needed
      const token             = authData.session.access_token;
      const token_expires_utc = new Date(authData.session.expires_at * 1000).toISOString();

      await updateLastLogin(supabase, profile.user_id);
      await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, user_id: profile.user_id, ok: true, error_code: 'ok' });

      return ok({ token, token_expires_utc, profile: userOut, access, login_via: 'email' });
    }


    // ============================================================
    // POST /verify
    // Body: { token } or Authorization: Bearer <token>
    // ============================================================
    if (pathname === '/verify') {
      const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim()
                 || (body.token || '').trim();

      if (!token) return fail('missing_token');

      // Supabase verifies the JWT and returns the auth user
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !authUser) return fail('invalid_or_expired');

      // Fetch profile from public.users
      const profile = await getUserBySupabaseUid(supabase, authUser.id);

      if (!profile)        return fail('user_missing');
      if (!profile.active) return fail('user_inactive');
      if (profile.expires_utc && new Date() >= new Date(profile.expires_utc)) return fail('user_expired');

      const subs   = await getActiveSubscriptions(supabase, profile.user_id);
      const access = getAccessFromSubscriptions(subs);

      const userOut = {
        user_id:              profile.user_id,
        username:             profile.username,
        name:                 profile.name || [profile.forename, profile.surname].filter(Boolean).join(' '),
        forename:             profile.forename     || '',
        surname:              profile.surname      || '',
        email:                profile.email,
        phone_number:         profile.phone_number || '',
        program_id:           profile.program_id   || '',
        cohort:               profile.cohort       || '',
        level:                profile.level        || '',
        avatar_url:           profile.avatar_url   || '',
        role:                 profile.role         || 'STUDENT',
        must_change_password: !!profile.must_change_password,
        expires_utc:          profile.expires_utc  || ''
      };

      return ok({
        user:    userOut,
        access,
        courses: access.courses,
        flags:   { is_admin: profile.role?.toUpperCase() === 'ADMIN' }
      });
    }


    // ============================================================
    // POST /register
    // Body: { forename, surname, email, password, phone_number?,
    //         program_id?, cohort?, username? }
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

      // Check email not already in use
      const existing = await getUserByEmail(supabase, email);
      if (existing) return fail('email_exists');

      // Resolve username
      let finalUsername = '';
      if (usernameInput) {
        if (!isValidUsername(usernameInput)) return fail('invalid_username');
        if (await usernameExists(supabase, usernameInput)) return fail('username_exists');
        finalUsername = usernameInput;
      } else {
        const existingUsernames = await getAllUsernames(supabase);
        finalUsername = generateUsernameFromForename(forename, existingUsernames);
      }

      const user_id = generateUserId();
      const now     = new Date().toISOString();
      const name    = [forename, surname].filter(Boolean).join(' ');

      // Create Supabase Auth user — handles password hashing
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true  // skip email confirmation for now
      });

      if (authError) {
        if (authError.message?.includes('already')) return fail('email_exists');
        return fail('registration_failed');
      }

      const supabase_uid = authData.user.id;

      // Insert profile into public.users
      await createUser(supabase, {
        user_id,
        supabase_uid,
        username:             finalUsername,
        email,
        name,
        forename,
        surname,
        phone_number,
        program_id,
        cohort,
        role:                 'STUDENT',
        active:               true,
        must_change_password: false,
        signup_source:        'SELF',
        created_utc:          now
      });

      // Assign WELCOME_TRIAL subscription
      try {
        const trialProduct = await getProductById(supabase, 'WELCOME_TRIAL');
        if (trialProduct) {
          const durationDays = trialProduct.duration_days || 7;
          const expires      = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
          await createSubscription(supabase, {
            subscription_id: 'S_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10),
            user_id,
            product_id:  'WELCOME_TRIAL',
            status:      'ACTIVE',
            start_utc:   now,
            expires_utc: expires,
            source:      'SYSTEM'
          });
        }
      } catch (e) {
        // Fail silently — user is created, trial just didn't attach
      }

      // Send welcome email via Resend
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
      let user = await getUserByEmail(supabase, identifier).catch(() => null);
      if (!user) user = await getUserByUsername(supabase, identifier).catch(() => null);

      if (!user || !user.active) return genericResponse;

      // Supabase sends the reset email automatically using our branded template
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: 'https://qacademy-alpha.pages.dev/reset-password'
      });

      if (!error) {
        // Store audit record
        await createResetRequest(supabase, {
          email:   user.email,
          user_id: user.user_id
        }).catch(() => {});
      }

      // Always return generic response
      return genericResponse;
    }


    // ============================================================
    // POST /reset/apply
    // Body: { access_token, new_password }
    // NOTE: Supabase sends the user back to /reset-password with
    // an access_token in the URL. The frontend passes it here.
    // ============================================================
    if (pathname === '/reset/apply') {
      const accessToken = (body.access_token || '').trim();
      const newPassword = (body.new_password || '');

      if (!accessToken)  return fail('missing_token');
      if (!newPassword)  return fail('missing_password');
      if (newPassword.length < 8) return fail('password_policy_failed');

      // Verify the token and get the user
      const { data: { user: authUser }, error: verifyError } = await supabase.auth.getUser(accessToken);

      if (verifyError || !authUser) return fail('invalid_or_expired');

      // Update password via Supabase Auth admin
      await updatePassword(supabase, authUser.id, newPassword);

      return ok({ message: 'password_updated' });
    }


    return fail('unknown_action');
  }
};