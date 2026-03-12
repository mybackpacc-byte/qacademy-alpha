
// ============================================================
// app/functions/api/auth.js
// QAcademy Nurses Hub — Pages Functions endpoint handlers
//
// Called by [[path]].js — never called directly by the frontend.
//
// Exports:
//   handleLogin(env, body)
//   handleVerify(env, token)
//   handleRegister(env, body)
//   handleResetRequest(env, body)
//   handleResetApply(env, body)
// ============================================================

import { generateUsernameFromForename, isValidUsername, generateUserId } from './password.js';
import {
  getSupabaseClient,
  getUserByEmail,
  getUserByUsername,
  getUserBySupabaseUid,
  getAllUsernames,
  usernameExists,
  getActiveSubscriptions,
  getAccessFromSubscriptions,
  createUser,
  createSubscription,
  updateLastLogin,
  getProductById,
  logAuthEvent,
  checkLoginRateLimit,
  createResetRequest,
  updatePassword
} from './db.js';
import { sendWelcomeSelfEmail } from './email.js';

const LOGIN_URL = 'https://qacademy-alpha.pages.dev/login';

// ============================================================
// handleLogin
// Called by: POST /api/login
// Returns: { ok, token, user } or { ok: false, error }
// ============================================================
export async function handleLogin(env, body) {
  const supabase = getSupabaseClient(env);

  const email    = (body.email    || '').trim().toLowerCase();
  const password = (body.password || '');
  const ip       = (body.ip       || '');

  if (!email || !password) {
    await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, ok: false, error_code: 'missing_credentials' });
    return { ok: false, error: 'missing_credentials' };
  }

  // Rate limit check
  const user = await getUserByEmail(supabase, email).catch(() => null);
  const rl   = await checkLoginRateLimit(supabase, email, user?.user_id || '', ip);
  if (rl.blocked) {
    await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, user_id: user?.user_id || '', ok: false, error_code: rl.reason });
    return { ok: false, error: rl.reason };
  }

  // Supabase Auth — verifies password
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

  if (authError || !authData?.user) {
    await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, ok: false, error_code: 'invalid_login' });
    return { ok: false, error: 'invalid_login' };
  }

  // Fetch profile from public.users
  const profile = await getUserBySupabaseUid(supabase, authData.user.id);

  if (!profile) {
    await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, ok: false, error_code: 'user_missing' });
    return { ok: false, error: 'user_missing' };
  }

  if (!profile.active) {
    await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, user_id: profile.user_id, ok: false, error_code: 'user_inactive' });
    return { ok: false, error: 'user_inactive' };
  }

  if (profile.expires_utc && new Date() >= new Date(profile.expires_utc)) {
    await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, user_id: profile.user_id, ok: false, error_code: 'user_expired' });
    return { ok: false, error: 'user_expired' };
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

  // The token is Supabase's JWT — stored in the httpOnly cookie by [[path]].js
  const token = authData.session.access_token;

  await updateLastLogin(supabase, profile.user_id);
  await logAuthEvent(supabase, { kind: 'LOGIN_EMAIL', identifier: email, user_id: profile.user_id, ok: true, error_code: 'ok' });

  return { ok: true, token, user: userOut, access };
}


// ============================================================
// handleVerify
// Called by: POST /api/verify
// token comes from the httpOnly cookie (extracted by [[path]].js)
// Returns: { ok, user, access, courses, flags } or { ok: false, error }
// ============================================================
export async function handleVerify(env, token) {
  const supabase = getSupabaseClient(env);

  // Supabase verifies the JWT
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authUser) return { ok: false, error: 'invalid_or_expired' };

  const profile = await getUserBySupabaseUid(supabase, authUser.id);

  if (!profile)        return { ok: false, error: 'user_missing' };
  if (!profile.active) return { ok: false, error: 'user_inactive' };
  if (profile.expires_utc && new Date() >= new Date(profile.expires_utc)) return { ok: false, error: 'user_expired' };

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

  return {
    ok:      true,
    user:    userOut,
    access,
    courses: access.courses,
    flags:   { is_admin: profile.role?.toUpperCase() === 'ADMIN' }
  };
}


// ============================================================
// handleRegister
// Called by: POST /api/register
// Returns: { ok, message } or { ok: false, error }
// ============================================================
export async function handleRegister(env, body) {
  const supabase    = getSupabaseClient(env);
  const resendKey   = env.RESEND_API_KEY;

  const forename      = (body.forename     || '').trim();
  const surname       = (body.surname      || '').trim();
  const email         = (body.email        || '').trim().toLowerCase();
  const password      = (body.password     || '');
  const phone_number  = (body.phone_number || '').trim();
  const program_id    = (body.program_id   || '').trim();
  const cohort        = (body.cohort       || '').trim();
  const usernameInput = (body.username     || '').trim().toLowerCase();

  if (!forename || !surname || !email || !password) return { ok: false, error: 'missing_fields' };
  if (password.length < 8) return { ok: false, error: 'password_policy_failed' };

  // Check email not already in use
  const existing = await getUserByEmail(supabase, email);
  if (existing) return { ok: false, error: 'email_exists' };

  // Resolve username
  let finalUsername = '';
  if (usernameInput) {
    if (!isValidUsername(usernameInput)) return { ok: false, error: 'invalid_username' };
    if (await usernameExists(supabase, usernameInput)) return { ok: false, error: 'username_exists' };
    finalUsername = usernameInput;
  } else {
    const existingUsernames = await getAllUsernames(supabase);
    finalUsername = generateUsernameFromForename(forename, existingUsernames);
  }

  const user_id = generateUserId();
  const now     = new Date().toISOString();
  const name    = [forename, surname].filter(Boolean).join(' ');

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError) {
    if (authError.message?.includes('already')) return { ok: false, error: 'email_exists' };
    return { ok: false, error: 'registration_failed' };
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

  return { ok: true, message: 'registered' };
}


// ============================================================
// handleResetRequest
// Called by: POST /api/reset/request
// Body: { identifier } — email or username
// Always returns generic message (never reveal if account exists)
// Returns: { ok: true, message }
// ============================================================
export async function handleResetRequest(env, body) {
  const supabase = getSupabaseClient(env);

  const genericResponse = { ok: true, message: 'If this account exists, a reset link has been sent.' };

  const identifier = (body.identifier || '').trim().toLowerCase();
  if (!identifier) return genericResponse;

  // Look up by email first, then username
  let user = await getUserByEmail(supabase, identifier).catch(() => null);
  if (!user) user = await getUserByUsername(supabase, identifier).catch(() => null);

  if (!user || !user.active) return genericResponse;

  // Supabase sends the branded reset email automatically
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: 'https://qacademy-alpha.pages.dev/reset-apply.html'
  });

  if (!error) {
    await createResetRequest(supabase, {
      email:   user.email,
      user_id: user.user_id
    }).catch(() => {});
  }

  return genericResponse;
}


// ============================================================
// handleResetApply
// Called by: POST /api/reset/apply
// Body: { access_token, new_password }
// access_token comes from the URL hash on the reset page
// Returns: { ok: true, message } or { ok: false, error }
// ============================================================
export async function handleResetApply(env, body) {
  const supabase = getSupabaseClient(env);

  const accessToken = (body.access_token || '').trim();
  const newPassword = (body.new_password || '');

  if (!accessToken)          return { ok: false, error: 'missing_token' };
  if (!newPassword)          return { ok: false, error: 'missing_password' };
  if (newPassword.length < 8) return { ok: false, error: 'password_policy_failed' };

  // Verify the token
  const { data: { user: authUser }, error: verifyError } = await supabase.auth.getUser(accessToken);

  if (verifyError || !authUser) return { ok: false, error: 'invalid_or_expired' };

  // Update password
  await updatePassword(supabase, authUser.id, newPassword);

  return { ok: true, message: 'password_updated' };
}
