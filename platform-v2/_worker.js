/**
 * QAcademy Alpha — Cloudflare Worker
 *
 * The Supabase JS client handles all auth flows in the browser
 * (email/password, Google OAuth, session refresh).
 * This worker's only auth job is:
 *   POST /auth/session  — receive tokens from browser, set HttpOnly cookies
 *   GET  /auth/verify   — read HttpOnly cookie, verify with Supabase, return user profile
 *   POST /auth/logout   — clear HttpOnly cookies, invalidate session
 *
 * All other requests pass through to static assets.
 *
 * Environment variables (Cloudflare Pages → Settings → Environment variables):
 *   SUPABASE_URL         = https://pyfupmmwptcpvxxxopxn.supabase.co
 *   SUPABASE_ANON_KEY    = your anon/public key
 *   SUPABASE_SERVICE_KEY = your service role key
 */

const COOKIE_NAME     = 'qa_session';
const COOKIE_TTL_S    = 12 * 60 * 60;      // 12 hours
const REFRESH_TTL_S   = 7  * 24 * 60 * 60; // 7 days

// ─── CORS ─────────────────────────────────────────────────────────────────────
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':      origin || '*',
    'Access-Control-Allow-Methods':     'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Pass all non-auth routes to static assets
    if (!url.pathname.startsWith('/auth/')) {
      return env.ASSETS.fetch(request);
    }

    const action = url.pathname.replace('/auth/', '').replace(/\/$/, '');

    try {
      switch (action) {
        case 'session': return await handleSession(request, env, origin);
        case 'verify':  return await handleVerify(request, env, origin);
        case 'logout':  return await handleLogout(request, env, origin);
        default:
          return jsonResponse({ ok: false, error: 'unknown_action' }, 404, origin);
      }
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ ok: false, error: 'server_error' }, 500, origin);
    }
  }
};


// ════════════════════════════════════════════════════════════════════════════
// POST /auth/session
// Called by login.html after Supabase JS client returns a session.
// Verifies the token, syncs public.users, sets HttpOnly cookies.
// ════════════════════════════════════════════════════════════════════════════
async function handleSession(request, env, origin) {
  const body         = await parseBody(request);
  const accessToken  = (body.access_token  || '').trim();
  const refreshToken = (body.refresh_token || '').trim();

  if (!accessToken) {
    return jsonResponse({ ok: false, error: 'missing_token' }, 400, origin);
  }

  // Verify the access token with Supabase Auth
  const authUser = await getSupabaseUser(env, accessToken);
  if (!authUser) {
    return jsonResponse({ ok: false, error: 'invalid_token' }, 401, origin);
  }

  // Sync user into public.users (creates row on first login, links on subsequent)
  await ensurePublicUser(env, authUser);

  // Get profile from public.users
  const profile = await getPublicUserProfile(env, authUser.id);

  // Set HttpOnly cookies and return profile
  const response = jsonResponse({ ok: true, profile }, 200, origin);
  setCookies(response, accessToken, refreshToken);
  return response;
}


// ════════════════════════════════════════════════════════════════════════════
// GET /auth/verify
// Called by guard.js on every protected page.
// Reads HttpOnly cookie, verifies with Supabase, returns user profile.
// ════════════════════════════════════════════════════════════════════════════
async function handleVerify(request, env, origin) {
  const accessToken = getCookie(request, COOKIE_NAME);
  if (!accessToken) {
    return jsonResponse({ ok: false, error: 'no_session' }, 401, origin);
  }

  const authUser = await getSupabaseUser(env, accessToken);
  if (!authUser) {
    // Token expired or invalid — clear cookies
    const response = jsonResponse({ ok: false, error: 'session_expired' }, 401, origin);
    clearCookies(response);
    return response;
  }

  const profile = await getPublicUserProfile(env, authUser.id);
  if (!profile) {
    // Auth user exists but no public.users row — sync it
    await ensurePublicUser(env, authUser);
    const freshProfile = await getPublicUserProfile(env, authUser.id);
    return jsonResponse({ ok: true, user: freshProfile }, 200, origin);
  }

  return jsonResponse({ ok: true, user: profile }, 200, origin);
}


// ════════════════════════════════════════════════════════════════════════════
// POST /auth/logout
// Clears HttpOnly cookies and invalidates the Supabase session.
// ════════════════════════════════════════════════════════════════════════════
async function handleLogout(request, env, origin) {
  const accessToken = getCookie(request, COOKIE_NAME);

  if (accessToken) {
    // Invalidate session in Supabase
    await fetch(`${env.SUPABASE_URL}/auth/v1/logout`, {
      method:  'POST',
      headers: {
        'apikey':        env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      }
    });
  }

  const response = jsonResponse({ ok: true }, 200, origin);
  clearCookies(response);
  return response;
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — Supabase Auth
// ════════════════════════════════════════════════════════════════════════════

async function getSupabaseUser(env, accessToken) {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey':        env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      }
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — public.users sync
// ════════════════════════════════════════════════════════════════════════════

async function ensurePublicUser(env, authUser) {
  if (!authUser || !authUser.id) return;

  const email = (authUser.email || '').toLowerCase();

  // Check by auth_id first (already linked)
  let rows = await supabaseSelect(env,
    `users?auth_id=eq.${encodeURIComponent(authUser.id)}&limit=1`
  );
  if (rows && rows.length > 0) return;

  // Check by email (existing user not yet linked)
  rows = await supabaseSelect(env,
    `users?email=eq.${encodeURIComponent(email)}&limit=1`
  );
  if (rows && rows.length > 0) {
    await supabasePatch(env,
      `users?email=eq.${encodeURIComponent(email)}`,
      { auth_id: authUser.id }
    );
    return;
  }

  // New user — create public.users row
  const meta     = authUser.user_metadata || {};
  const name     = meta.full_name || meta.name || email.split('@')[0];
  const forename = meta.given_name  || name.split(' ')[0] || '';
  const surname  = meta.family_name || name.split(' ').slice(1).join(' ') || '';
  const userId   = 'U_' + authUser.id.replace(/-/g, '').slice(0, 10);

  await supabaseInsert(env, 'users', {
    user_id:       userId,
    auth_id:       authUser.id,
    email,
    name,
    forename,
    surname,
    username:      email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, ''),
    avatar_url:    meta.avatar_url || meta.picture || '',
    role:          'STUDENT',
    active:        true,
    created_utc:   new Date().toISOString(),
    signup_source: 'SUPABASE_AUTH',
  });
}

async function getPublicUserProfile(env, authId) {
  const rows = await supabaseSelect(env,
    `users?auth_id=eq.${encodeURIComponent(authId)}&limit=1`
  );
  if (!rows || !rows[0]) return null;
  const u = rows[0];
  return {
    user_id:              u.user_id,
    username:             u.username,
    name:                 u.name,
    forename:             u.forename,
    surname:              u.surname,
    email:                u.email,
    role:                 u.role,
    program_id:           u.program_id,
    avatar_url:           u.avatar_url || '',
    must_change_password: !!u.must_change_password,
  };
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — Supabase REST
// ════════════════════════════════════════════════════════════════════════════

async function supabaseSelect(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data : null;
}

async function supabaseInsert(env, table, data) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: {
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(data)
  });
}

async function supabasePatch(env, path, data) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method:  'PATCH',
    headers: {
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(data)
  });
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — Cookies
// ════════════════════════════════════════════════════════════════════════════

function setCookies(response, accessToken, refreshToken) {
  response.headers.append('Set-Cookie',
    `${COOKIE_NAME}=${accessToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_TTL_S}`
  );
  if (refreshToken) {
    response.headers.append('Set-Cookie',
      `qa_refresh=${refreshToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${REFRESH_TTL_S}`
    );
  }
}

function clearCookies(response) {
  response.headers.append('Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
  response.headers.append('Set-Cookie',
    `qa_refresh=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match  = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — Utilities
// ════════════════════════════════════════════════════════════════════════════

async function parseBody(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    try { return await request.json(); } catch { return {}; }
  }
  return {};
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin)
    }
  });
}
