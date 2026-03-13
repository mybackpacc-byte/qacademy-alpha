/**
 * QAcademy Alpha — Cloudflare Worker
 * Authentication via Supabase Auth
 *
 * Environment variables (set in Cloudflare Pages dashboard):
 *   SUPABASE_URL         = https://pyfupmmwptcpvxxxopxn.supabase.co
 *   SUPABASE_SERVICE_KEY = your service role secret key
 *   SUPABASE_ANON_KEY    = your anon/public key
 */

const COOKIE_NAME  = 'qa_session';
const COOKIE_TTL_S = 12 * 60 * 60; // 12 hours

// ─── CORS ────────────────────────────────────────────────────────────────────
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
        case 'login':         return await handleLogin(request, env, origin);
        case 'login-google':  return await handleGoogleLogin(request, env, origin);
        case 'callback':      return await handleCallback(request, env, origin);
        case 'verify':        return await handleVerify(request, env, origin);
        case 'logout':        return await handleLogout(request, env, origin);
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
// ACTION: /auth/login  (email or username + password)
// ════════════════════════════════════════════════════════════════════════════
async function handleLogin(request, env, origin) {
  const body       = await parseBody(request);
  const identifier = (body.identifier || '').trim().toLowerCase();
  const password   = (body.password   || '');

  if (!identifier || !password) {
    return jsonResponse({ ok: false, error: 'missing_credentials' }, 400, origin);
  }

  // If identifier is not an email, look up the email by username
  let email = identifier;
  if (!identifier.includes('@')) {
    const user = await getUserByUsername(env, identifier);
    if (!user) {
      return jsonResponse({ ok: false, error: 'invalid_login' }, 401, origin);
    }
    email = user.email;
  }

  // Sign in via Supabase Auth
  const authRes = await fetch(
    `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':       env.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password })
    }
  );

  const authData = await authRes.json();

  if (!authRes.ok || !authData.access_token) {
    const errMsg = (authData.error_description || authData.msg || '').toLowerCase();
    let error = 'invalid_login';
    if (errMsg.includes('email not confirmed')) error = 'email_not_confirmed';
    return jsonResponse({ ok: false, error }, 401, origin);
  }

  // Ensure user exists in public.users
  await ensurePublicUser(env, authData.user);

  const response = jsonResponse({
    ok:      true,
    profile: await getPublicUserProfile(env, authData.user.id)
  }, 200, origin);

  setCookies(response, authData.access_token, authData.refresh_token);
  return response;
}


// ════════════════════════════════════════════════════════════════════════════
// ACTION: /auth/login-google
// Redirects browser to Supabase Google OAuth
// ════════════════════════════════════════════════════════════════════════════
async function handleGoogleLogin(request, env, origin) {
  const url      = new URL(request.url);
  const returnTo = url.searchParams.get('return_to') || '/dashboard.html';

  // Build Supabase OAuth URL
  const redirectTo = `${url.origin}/auth/callback?return_to=${encodeURIComponent(returnTo)}`;
  const oauthUrl   = `${env.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;

  return Response.redirect(oauthUrl, 302);
}

// ════════════════════════════════════════════════════════════════════════════
// ACTION: /auth/callback
// Supabase redirects here after Google OAuth with a code
// ════════════════════════════════════════════════════════════════════════════
async function handleCallback(request, env, origin) {
  const url      = new URL(request.url);
  const code     = url.searchParams.get('code');
  const returnTo = url.searchParams.get('return_to') || '/dashboard.html';

  if (!code) {
    return Response.redirect('/login.html?error=oauth_failed', 302);
  }

  // Exchange code for session
  const tokenRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey':       env.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ auth_code: code })
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.access_token) {
    console.error('OAuth callback error:', tokenData);
    return Response.redirect('/login.html?error=oauth_failed', 302);
  }

  // Ensure user exists in public.users
  await ensurePublicUser(env, tokenData.user);

  // Set cookies and redirect to dashboard
  const response = Response.redirect(returnTo, 302);
  setCookies(response, tokenData.access_token, tokenData.refresh_token);
  return response;
}


// ════════════════════════════════════════════════════════════════════════════
// ACTION: /auth/verify
// ════════════════════════════════════════════════════════════════════════════
async function handleVerify(request, env, origin) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) {
    return jsonResponse({ ok: false, error: 'no_session' }, 401, origin);
  }

  // Verify JWT with Supabase Auth
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey':        env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
    }
  });

  if (!userRes.ok) {
    return jsonResponse({ ok: false, error: 'invalid_or_expired' }, 401, origin);
  }

  const authUser = await userRes.json();
  if (!authUser || !authUser.id) {
    return jsonResponse({ ok: false, error: 'invalid_or_expired' }, 401, origin);
  }

  const profile = await getPublicUserProfile(env, authUser.id);

  return jsonResponse({ ok: true, user: profile }, 200, origin);
}


// ════════════════════════════════════════════════════════════════════════════
// ACTION: /auth/logout
// ════════════════════════════════════════════════════════════════════════════
async function handleLogout(request, env, origin) {
  const token = getCookie(request, COOKIE_NAME);

  if (token) {
    await fetch(`${env.SUPABASE_URL}/auth/v1/logout`, {
      method:  'POST',
      headers: {
        'apikey':        env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });
  }

  const response = jsonResponse({ ok: true }, 200, origin);
  response.headers.append('Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
  response.headers.append('Set-Cookie',
    `qa_refresh=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
  return response;
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — public.users sync
// ════════════════════════════════════════════════════════════════════════════

async function ensurePublicUser(env, authUser) {
  if (!authUser || !authUser.id) return;

  const email = (authUser.email || '').toLowerCase();

  // Check if user already exists by auth_id first, then email
  let rows = await supabaseSelect(env,
    `users?auth_id=eq.${encodeURIComponent(authUser.id)}&limit=1`
  );

  if (rows && rows.length > 0) return; // already linked, nothing to do

  // Check by email (existing user not yet linked to Supabase Auth)
  rows = await supabaseSelect(env,
    `users?email=eq.${encodeURIComponent(email)}&limit=1`
  );

  if (rows && rows.length > 0) {
    // Link existing user to Supabase Auth
    await supabasePatch(env,
      `users?email=eq.${encodeURIComponent(email)}`,
      { auth_id: authUser.id }
    );
    return;
  }

  // Brand new user — create public.users row
  const meta     = authUser.user_metadata || {};
  const name     = meta.full_name || meta.name || email.split('@')[0];
  const forename = meta.given_name  || name.split(' ')[0] || '';
  const surname  = meta.family_name || name.split(' ').slice(1).join(' ') || '';
  const userId   = 'U_' + authUser.id.replace(/-/g, '').slice(0, 10);

  await supabaseInsert(env, 'users', {
    user_id:      userId,
    auth_id:      authUser.id,
    email,
    name,
    forename,
    surname,
    username:     email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, ''),
    avatar_url:   meta.avatar_url || meta.picture || '',
    role:         'STUDENT',
    active:       true,
    created_utc:  new Date().toISOString(),
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

async function getUserByUsername(env, username) {
  const rows = await supabaseSelect(env,
    `users?username=eq.${encodeURIComponent(username)}&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — Supabase REST
// ════════════════════════════════════════════════════════════════════════════

async function supabaseSelect(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method:  'GET',
    headers: {
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    }
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows : null;
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
// HELPERS — Cookies + Utilities
// ════════════════════════════════════════════════════════════════════════════

function setCookies(response, accessToken, refreshToken) {
  response.headers.append('Set-Cookie',
    `${COOKIE_NAME}=${accessToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_TTL_S}`
  );
  if (refreshToken) {
    response.headers.append('Set-Cookie',
      `qa_refresh=${refreshToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`
    );
  }
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match  = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function parseBody(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    try { return await request.json(); } catch { return {}; }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    const obj  = {};
    for (const [k, v] of new URLSearchParams(text)) obj[k] = v;
    return obj;
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
