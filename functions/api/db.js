// ============================================================
// app/functions/api/db.js
// QAcademy Nurses Hub — Supabase query helpers
// Exact copy of app/workers/auth-worker/db.js
// Uses service role key — bypasses RLS (RLS added later)
// ============================================================

import { createClient } from '@supabase/supabase-js';

/**
 * Create a Supabase client using environment secrets.
 * Called at the start of each request.
 */
export function getSupabaseClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false
    }
  });
}

// ============================================================
// USER LOOKUPS
// ============================================================

export async function getUserByEmail(supabase, email) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('email', email.trim())
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function getUserById(supabase, userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId.trim())
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function getUserByUsername(supabase, username) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('username', username.trim())
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function getUserBySupabaseUid(supabase, uid) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('supabase_uid', uid)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function usernameExists(supabase, username) {
  const { data, error } = await supabase
    .from('users')
    .select('user_id')
    .ilike('username', username.trim())
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

export async function getAllUsernames(supabase) {
  const { data, error } = await supabase
    .from('users')
    .select('username')
    .not('username', 'is', null);

  if (error) throw error;
  return new Set((data || []).map(r => r.username.toLowerCase()));
}

// ============================================================
// SUBSCRIPTIONS & ACCESS
// ============================================================

export async function getActiveSubscriptions(supabase, userId) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      subscription_id,
      product_id,
      status,
      start_utc,
      expires_utc,
      source,
      products (
        name,
        courses_included,
        kind
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .or(`expires_utc.is.null,expires_utc.gt.${now}`);

  if (error) throw error;

  return (data || []).map(s => ({
    subscription_id:  s.subscription_id,
    product_id:       s.product_id,
    status:           s.status,
    start_utc:        s.start_utc,
    expires_utc:      s.expires_utc,
    source:           s.source,
    product_name:     s.products?.name             || '',
    courses_included: s.products?.courses_included || '',
    kind:             s.products?.kind             || ''
  }));
}

export function getAccessFromSubscriptions(subs) {
  const productIds = [];
  const kinds      = [];
  const courseSet  = new Set();

  for (const s of subs) {
    if (s.product_id) productIds.push(s.product_id);
    if (s.kind)       kinds.push(s.kind);

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

// ============================================================
// USER WRITES
// ============================================================

export async function createUser(supabase, user) {
  const { error } = await supabase
    .from('users')
    .insert({
      user_id:              user.user_id,
      supabase_uid:         user.supabase_uid         || null,
      username:             user.username,
      email:                user.email,
      name:                 user.name,
      forename:             user.forename,
      surname:              user.surname,
      phone_number:         user.phone_number          || '',
      program_id:           user.program_id            || '',
      cohort:               user.cohort                || '',
      role:                 user.role                  || 'STUDENT',
      active:               user.active                ?? true,
      must_change_password: user.must_change_password  ?? false,
      signup_source:        user.signup_source         || 'SELF',
      created_utc:          user.created_utc
    });

  if (error) throw error;
}

export async function updateLastLogin(supabase, userId) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('users')
    .update({ last_login_utc: now })
    .eq('user_id', userId);

  if (error) throw error;
}

export async function updatePassword(supabase, supabaseUid, newPassword) {
  const { error } = await supabase.auth.admin.updateUserById(supabaseUid, {
    password: newPassword
  });

  if (error) throw error;
}

// ============================================================
// SUBSCRIPTIONS WRITES
// ============================================================

export async function createSubscription(supabase, sub) {
  const { error } = await supabase
    .from('subscriptions')
    .insert({
      subscription_id: sub.subscription_id,
      user_id:         sub.user_id,
      product_id:      sub.product_id,
      status:          sub.status      || 'ACTIVE',
      start_utc:       sub.start_utc,
      expires_utc:     sub.expires_utc || null,
      source:          sub.source      || 'SYSTEM'
    });

  if (error) throw error;
}

// ============================================================
// PRODUCTS
// ============================================================

export async function getProductById(supabase, productId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('product_id', productId.trim().toUpperCase())
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// ============================================================
// AUTH EVENTS
// ============================================================

export async function logAuthEvent(supabase, event) {
  try {
    const { error } = await supabase
      .from('auth_events')
      .insert({
        event_id:   crypto.randomUUID(),
        ts_utc:     new Date().toISOString(),
        kind:       event.kind        || '',
        identifier: event.identifier  || '',
        user_id:    event.user_id     || '',
        ip_hash:    event.ip_hash     || '',
        ua_hash:    event.ua_hash     || '',
        ok:         event.ok          ?? false,
        error_code: event.error_code  || '',
        note:       event.note        || ''
      });

    if (error) console.error('logAuthEvent error:', error.message);
  } catch (e) {
    // Fail silently
  }
}

// ============================================================
// RATE LIMITING
// ============================================================

export async function checkLoginRateLimit(supabase, identifier, userId, ip) {
  try {
    const now         = new Date();
    const cutoffShort = new Date(now - 10 * 60 * 1000).toISOString();
    const cutoffLong  = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const ipHash      = ip ? await hashStr(ip) : '';

    const { count: shortCount, error: e1 } = await supabase
      .from('auth_events')
      .select('*', { count: 'exact', head: true })
      .eq('ok', false)
      .gte('ts_utc', cutoffShort)
      .or(`identifier.eq.${identifier},user_id.eq.${userId},ip_hash.eq.${ipHash}`);

    const { count: longCount, error: e2 } = await supabase
      .from('auth_events')
      .select('*', { count: 'exact', head: true })
      .eq('ok', false)
      .gte('ts_utc', cutoffLong)
      .or(`identifier.eq.${identifier},user_id.eq.${userId},ip_hash.eq.${ipHash}`);

    if (e1 || e2) return { blocked: false };

    if ((longCount  || 0) >= 10) return { blocked: true, reason: 'too_many_attempts_24h' };
    if ((shortCount || 0) >= 5)  return { blocked: true, reason: 'too_many_attempts' };

    return { blocked: false };

  } catch (e) {
    return { blocked: false };
  }
}

async function hashStr(input) {
  const encoder    = new TextEncoder();
  const data       = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  const base64     = btoa(String.fromCharCode(...hashArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ============================================================
// RESET PASSWORD
// ============================================================

export async function createResetRequest(supabase, req) {
  const { error } = await supabase
    .from('reset_requests')
    .insert({
      request_id:    crypto.randomUUID(),
      email:         req.email,
      user_id:       req.user_id     || '',
      status:        'REQUESTED',
      requested_utc: new Date().toISOString()
    });

  if (error) throw error;
}
