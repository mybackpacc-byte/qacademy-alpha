/**
 * QAcademy Alpha — Cloudflare Worker
 * Handles all authentication: login, Google Sign-In, verify, logout
 * Uses HttpOnly cookies (never exposes tokens to JavaScript)
 *
 * Environment variables (set in Cloudflare Pages dashboard):
 *   SUPABASE_URL         = https://pyfupmmwptcpvxxxopxn.supabase.co
 *   SUPABASE_SERVICE_KEY = your service role secret key
 *   GOOGLE_CLIENT_ID     = 117220903038-1qe508lr01t59mjabeavcl640hraigs4.apps.googleusercontent.com
 */

const COOKIE_NAME   = 'qa_session';
const TOKEN_TTL_MS  = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
const COOKIE_TTL_S  = 12 * 60 * 60;         // 12 hours in seconds

// ─── Rate limiting windows ───────────────────────────────────────────────────
const RL_SHORT_WINDOW_MS  = 10 * 60 * 1000;  // 10 minutes
const RL_SHORT_MAX        = 5;                // max 5 failed attempts per 10 min
const RL_LONG_WINDOW_MS   = 24 * 60 * 60 * 1000; // 24 hours
const RL_LONG_MAX         = 20;               // max 20 failed attempts per 24h

// ─── CORS headers ────────────────────────────────────────────────────────────
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin':      origin || '*',
    'Access-Control-Allow-Methods':     'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// ─── Main fetch handler ──────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // Handle preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Only handle /auth/* routes
    if (!url.pathname.startsWith('/auth/')) {
      return new Response('Not found', { status: 404 });
    }

    const action = url.pathname.replace('/auth/', '').replace(/\/$/, '');

    try {
      switch (action) {
        case 'login':         return await handleLogin(request, env, origin);
        case 'login-google':  return await handleGoogleLogin(request, env, origin);
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
// ACTION: /auth/login  (email/username + password)
// ════════════════════════════════════════════════════════════════════════════
async function handleLogin(request, env, origin) {
  const body       = await parseBody(request);
  const identifier = (body.identifier || '').trim().toLowerCase();
  const password   = (body.password   || '');
  const ua         = request.headers.get('User-Agent') || '';
  const ip         = request.headers.get('CF-Connecting-IP') || '';

  if (!identifier || !password) {
    return jsonResponse({ ok: false, error: 'missing_credentials' }, 400, origin);
  }

  const isEmail = identifier.includes('@');

  // 1) Look up user
  const user = isEmail
    ? await getUserByEmail(env, identifier)
    : await getUserByUsername(env, identifier);

  // 2) Rate limit check (always check before verifying password)
  const rlBlocked = await checkRateLimit(env, {
    identifier,
    user_id:  user ? user.user_id : '',
    ip,
    kind:     isEmail ? 'LOGIN_EMAIL' : 'LOGIN_USERNAME'
  });

  if (rlBlocked) {
    await logAuthEvent(env, {
      kind:       isEmail ? 'LOGIN_EMAIL' : 'LOGIN_USERNAME',
      identifier, user_id: user ? user.user_id : '',
      ip, ua, ok: false,
      error_code: 'too_many_attempts'
    });
    return jsonResponse({ ok: false, error: 'too_many_attempts' }, 429, origin);
  }

  // 3) Validate user exists and is active
  if (!user || !user.active) {
    await logAuthEvent(env, {
      kind: isEmail ? 'LOGIN_EMAIL' : 'LOGIN_USERNAME',
      identifier, user_id: '', ip, ua, ok: false,
      error_code: 'invalid_login', note: !user ? 'no_user' : 'user_inactive'
    });
    return jsonResponse({ ok: false, error: 'invalid_login' }, 401, origin);
  }

  // 4) Verify password: SHA-256(salt + password) — must match old system exactly
  const expectedHash = await sha256WebSafe(user.salt + password);
  if (expectedHash !== user.password_hash) {
    await logAuthEvent(env, {
      kind: isEmail ? 'LOGIN_EMAIL' : 'LOGIN_USERNAME',
      identifier, user_id: user.user_id, ip, ua, ok: false,
      error_code: 'invalid_login', note: 'bad_password'
    });
    return jsonResponse({ ok: false, error: 'invalid_login' }, 401, origin);
  }

  // 5) Issue token + set HttpOnly cookie
  return await issueSessionAndRespond(env, user, ua, ip, 'password', origin);
}


// ════════════════════════════════════════════════════════════════════════════
// ACTION: /auth/login-google
// ════════════════════════════════════════════════════════════════════════════
async function handleGoogleLogin(request, env, origin) {
  const body     = await parseBody(request);
  const idToken  = (body.id_token || '').trim();
  const ua       = request.headers.get('User-Agent') || '';
  const ip       = request.headers.get('CF-Connecting-IP') || '';

  if (!idToken) {
    return jsonResponse({ ok: false, error: 'missing_id_token' }, 400, origin);
  }

  // 1) Verify Google ID token
  const googlePayload = await verifyGoogleToken(idToken, env.GOOGLE_CLIENT_ID);
  if (!googlePayload) {
    return jsonResponse({ ok: false, error: 'invalid_google_token' }, 401, origin);
  }

  const email = (googlePayload.email || '').toLowerCase();
  if (!email) {
    return jsonResponse({ ok: false, error: 'no_email_from_google' }, 401, origin);
  }

  // 2) Look up user by email
  const user = await getUserByEmail(env, email);
  if (!user || !user.active) {
    await logAuthEvent(env, {
      kind: 'LOGIN_GOOGLE', identifier: email,
      user_id: '', ip, ua, ok: false,
      error_code: !user ? 'no_account' : 'user_inactive'
    });
    return jsonResponse({
      ok: false,
      error: !user ? 'no_account' : 'user_inactive'
    }, 401, origin);
  }

  // 3) Issue session
  return await issueSessionAndRespond(env, user, ua, ip, 'GOOGLE', origin);
}


// ════════════════════════════════════════════════════════════════════════════
// ACTION: /auth/verify  (called by every protected page on load)
// ════════════════════════════════════════════════════════════════════════════
async function handleVerify(request, env, origin) {
  const token = getTokenFromCookie(request);
  if (!token) {
    return jsonResponse({ ok: false, error: 'no_session' }, 401, origin);
  }

  const tokenRow = await getActiveToken(env, token);
  if (!tokenRow) {
    return jsonResponse({ ok: false, error: 'invalid_or_expired' }, 401, origin);
  }

  // Update last_seen_utc
  await supabasePatch(env, `tokens?token=eq.${encodeURIComponent(token)}`, {
    last_seen_utc: new Date().toISOString()
  });

  // Fetch user profile
  const user = await getUserById(env, tokenRow.user_id);
  if (!user || !user.active) {
    return jsonResponse({ ok: false, error: 'user_inactive' }, 401, origin);
  }

  return jsonResponse({
    ok: true,
    user: {
      user_id:    user.user_id,
      username:   user.username,
      name:       user.name,
      forename:   user.forename,
      surname:    user.surname,
      email:      user.email,
      role:       user.role,
      program_id: user.program_id,
      avatar_url: user.avatar_url || '',
      must_change_password: !!user.must_change_password,
    }
  }, 200, origin);
}


// ════════════════════════════════════════════════════════════════════════════
// ACTION: /auth/logout
// ════════════════════════════════════════════════════════════════════════════
async function handleLogout(request, env, origin) {
  const token = getTokenFromCookie(request);

  if (token) {
    // Deactivate token in Supabase
    await supabasePatch(env, `tokens?token=eq.${encodeURIComponent(token)}`, {
      active: false
    });
  }

  // Clear the cookie
  const response = jsonResponse({ ok: true }, 200, origin);
  response.headers.set('Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
  return response;
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — Session + Token
// ════════════════════════════════════════════════════════════════════════════

async function issueSessionAndRespond(env, user, ua, ip, loginVia, origin) {
  // Generate token: SHA-256 of (random UUID + timestamp) — matches old system format
  const rawToken   = await sha256WebSafe(crypto.randomUUID() + new Date().toISOString());
  const issuedAt   = new Date();
  const expiresAt  = new Date(issuedAt.getTime() + TOKEN_TTL_MS);

  const deviceLabel = deriveDeviceLabel(ua);
  const uaHash      = await sha256WebSafe(ua);
  const ipHash      = ip ? await sha256WebSafe(ip) : '';

  // Write token to Supabase
  await supabaseInsert(env, 'tokens', {
    token:          rawToken,
    user_id:        user.user_id,
    kind:           'LOGIN',
    issued_utc:     issuedAt.toISOString(),
    expires_utc:    expiresAt.toISOString(),
    ua_hash:        uaHash,
    ip_hash:        ipHash,
    last_seen_utc:  issuedAt.toISOString(),
    device_label:   deviceLabel,
    login_via:      loginVia,
    active:         true
  });

  // Update user last_login_utc
  await supabasePatch(env, `users?user_id=eq.${user.user_id}`, {
    last_login_utc: issuedAt.toISOString()
  });

  await logAuthEvent(env, {
    kind:       loginVia === 'GOOGLE' ? 'LOGIN_GOOGLE' : 'LOGIN_EMAIL',
    identifier: user.email,
    user_id:    user.user_id,
    ip, ua, ok: true, error_code: 'ok'
  });

  // Build response with HttpOnly cookie
  const response = jsonResponse({
    ok: true,
    profile: {
      user_id:    user.user_id,
      username:   user.username,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      program_id: user.program_id,
      avatar_url: user.avatar_url || '',
      must_change_password: !!user.must_change_password,
    }
  }, 200, origin);

  // Set the HttpOnly session cookie
  response.headers.set('Set-Cookie',
    `${COOKIE_NAME}=${rawToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_TTL_S}`
  );

  return response;
}

function getTokenFromCookie(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — Supabase queries
// ════════════════════════════════════════════════════════════════════════════

async function supabaseFetch(env, path, options = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
      ...(options.headers || {})
    }
  });
  return res;
}

async function supabaseSelect(env, path) {
  const res = await supabaseFetch(env, path, { method: 'GET', headers: { 'Prefer': '' } });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows : null;
}

async function supabaseInsert(env, table, data) {
  return supabaseFetch(env, table, {
    method:  'POST',
    body:    JSON.stringify(data),
    headers: { 'Prefer': 'return=minimal' }
  });
}

async function supabasePatch(env, path, data) {
  return supabaseFetch(env, path, {
    method:  'PATCH',
    body:    JSON.stringify(data),
    headers: { 'Prefer': 'return=minimal' }
  });
}

async function getUserByEmail(env, email) {
  const rows = await supabaseSelect(env,
    `users?email=eq.${encodeURIComponent(email)}&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

async function getUserByUsername(env, username) {
  const rows = await supabaseSelect(env,
    `users?username=eq.${encodeURIComponent(username)}&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

async function getUserById(env, userId) {
  const rows = await supabaseSelect(env,
    `users?user_id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

async function getActiveToken(env, token) {
  const now = new Date().toISOString();
  const rows = await supabaseSelect(env,
    `tokens?token=eq.${encodeURIComponent(token)}&active=eq.true&expires_utc=gt.${now}&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — Rate limiting
// ════════════════════════════════════════════════════════════════════════════

async function checkRateLimit(env, { identifier, user_id, ip, kind }) {
  const now     = new Date();
  const shortCutoff = new Date(now.getTime() - RL_SHORT_WINDOW_MS).toISOString();
  const longCutoff  = new Date(now.getTime() - RL_LONG_WINDOW_MS).toISOString();

  // Count recent failures by this identifier (email/username)
  const byIdentifier = await supabaseSelect(env,
    `auth_events?identifier=eq.${encodeURIComponent(identifier)}&ok=eq.false&ts_utc=gt.${shortCutoff}`
  );

  if (byIdentifier && byIdentifier.length >= RL_SHORT_MAX) return true;

  // Count long-window failures by IP
  if (ip) {
    const ipHash = await sha256WebSafe(ip);
    const byIp = await supabaseSelect(env,
      `auth_events?ip_hash=eq.${encodeURIComponent(ipHash)}&ok=eq.false&ts_utc=gt.${longCutoff}`
    );
    if (byIp && byIp.length >= RL_LONG_MAX) return true;
  }

  return false;
}

async function logAuthEvent(env, { kind, identifier, user_id, ip, ua, ok, error_code, note }) {
  const ipHash = ip ? await sha256WebSafe(ip) : '';
  const uaHash = ua ? await sha256WebSafe(ua) : '';

  await supabaseInsert(env, 'auth_events', {
    kind,
    identifier,
    user_id:    user_id || null,
    ip_hash:    ipHash,
    ua_hash:    uaHash,
    ok,
    error_code: error_code || '',
    note:       note || '',
    ts_utc:     new Date().toISOString()
  });
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — Google token verification
// ════════════════════════════════════════════════════════════════════════════

async function verifyGoogleToken(idToken, clientId) {
  try {
    // Use Google's tokeninfo endpoint to verify
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!res.ok) return null;
    const payload = await res.json();

    // Validate audience matches our client ID
    if (payload.aud !== clientId) return null;

    // Validate token is not expired
    if (payload.exp && Date.now() / 1000 > parseInt(payload.exp)) return null;

    return payload;
  } catch {
    return null;
  }
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — Crypto
// ════════════════════════════════════════════════════════════════════════════

async function sha256WebSafe(input) {
  const encoder = new TextEncoder();
  const data     = encoder.encode(input);
  const hashBuf  = await crypto.subtle.digest('SHA-256', data);
  const bytes    = new Uint8Array(hashBuf);

  // Base64url encode (web-safe, no padding) — matches old Apps Script format
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}


// ════════════════════════════════════════════════════════════════════════════
// HELPERS — Utilities
// ════════════════════════════════════════════════════════════════════════════

async function parseBody(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    try { return await request.json(); } catch { return {}; }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const text   = await request.text();
    const params = new URLSearchParams(text);
    const obj    = {};
    for (const [k, v] of params) obj[k] = v;
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

function deriveDeviceLabel(ua) {
  if (!ua) return '';
  let platform = 'Unknown';
  if (/android/i.test(ua))                        platform = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua))          platform = 'iOS';
  else if (/windows/i.test(ua))                   platform = 'Windows';
  else if (/macintosh|mac os x/i.test(ua))        platform = 'macOS';
  else if (/linux/i.test(ua))                     platform = 'Linux';

  let browser = 'Browser';
  if (/edg/i.test(ua))                            browser = 'Edge';
  else if (/chrome/i.test(ua))                    browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua))                   browser = 'Firefox';

  return `${platform} · ${browser}`;
}
