import { getSupabase, getUserByEmail, getUserById, createUserProfile, getActiveSubscriptions, createSubscription, logAuthEvent } from './db.js';

const COOKIE_NAME = 'qa_session';
const COOKIE_OPTIONS = 'HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800';

function setCookieHeader(accessToken, refreshToken) {
  const val = JSON.stringify({ access_token: accessToken, refresh_token: refreshToken });
  const encoded = btoa(val);
  return `${COOKIE_NAME}=${encoded}; ${COOKIE_OPTIONS}`;
}

function clearCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function parseCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map(p => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${COOKIE_NAME}=`)) {
      try {
        const encoded = part.slice(COOKIE_NAME.length + 1);
        return JSON.parse(atob(encoded));
      } catch { return null; }
    }
  }
  return null;
}

function generateUserId() {
  return 'U_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

function generateSubscriptionId() {
  return 'S_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

export async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!email || !password) {
    return json({ ok: false, error: 'missing_credentials' }, 400);
  }

  const supabase = getSupabase(env);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    await logAuthEvent(supabase, {
      kind: 'LOGIN',
      identifier: email,
      ok: false,
      error_code: error?.message || 'invalid_login',
      ip: request.headers.get('CF-Connecting-IP') || ''
    });
    return json({ ok: false, error: 'invalid_login' }, 401);
  }

  const profile = await getUserByEmail(supabase, email);
  if (!profile) return json({ ok: false, error: 'user_missing' }, 401);
  if (!profile.active) return json({ ok: false, error: 'user_inactive' }, 401);

  const subs = await getActiveSubscriptions(supabase, profile.user_id);
  const courseIds = [];
  subs.forEach(s => {
    const courses = (s.products?.courses_included || '').split(',').map(c => c.trim()).filter(Boolean);
    courses.forEach(c => { if (!courseIds.includes(c)) courseIds.push(c); });
  });

  await logAuthEvent(supabase, {
    kind: 'LOGIN',
    identifier: email,
    user_id: profile.user_id,
    ok: true,
    error_code: 'ok',
    ip: request.headers.get('CF-Connecting-IP') || ''
  });

  const responseBody = {
    ok: true,
    profile: {
      user_id: profile.user_id,
      name: profile.name || [profile.forename, profile.surname].filter(Boolean).join(' '),
      forename: profile.forename || '',
      surname: profile.surname || '',
      email: profile.email,
      phone_number: profile.phone_number || '',
      program_id: profile.program_id || '',
      cohort: profile.cohort || '',
      avatar_url: profile.avatar_url || '',
      role: profile.role || '',
      must_change_password: profile.must_change_password || false
    },
    access: { course_ids: courseIds }
  };

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setCookieHeader(data.session.access_token, data.session.refresh_token)
    }
  });
}

export async function handleVerify(request, env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const session = parseCookie(cookieHeader);

  if (!session?.access_token) {
    return json({ ok: false, error: 'no_session' }, 401);
  }

  const supabase = getSupabase(env);
  const { data, error } = await supabase.auth.getUser(session.access_token);

  if (error || !data?.user) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_session' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearCookieHeader()
      }
    });
  }

  const profile = await getUserByEmail(supabase, data.user.email);
  if (!profile) return json({ ok: false, error: 'user_missing' }, 401);
  if (!profile.active) return json({ ok: false, error: 'user_inactive' }, 401);

  const subs = await getActiveSubscriptions(supabase, profile.user_id);
  const courseIds = [];
  subs.forEach(s => {
    const courses = (s.products?.courses_included || '').split(',').map(c => c.trim()).filter(Boolean);
    courses.forEach(c => { if (!courseIds.includes(c)) courseIds.push(c); });
  });

  return json({
    ok: true,
    profile: {
      user_id: profile.user_id,
      name: profile.name || [profile.forename, profile.surname].filter(Boolean).join(' '),
      forename: profile.forename || '',
      surname: profile.surname || '',
      email: profile.email,
      phone_number: profile.phone_number || '',
      program_id: profile.program_id || '',
      cohort: profile.cohort || '',
      avatar_url: profile.avatar_url || '',
      role: profile.role || '',
      must_change_password: profile.must_change_password || false
    },
    access: { course_ids: courseIds },
    flags: { is_admin: (profile.role || '').toUpperCase() === 'ADMIN' }
  });
}

export async function handleLogout(request, env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const session = parseCookie(cookieHeader);

  if (session?.access_token) {
    const supabase = getSupabase(env);
    await supabase.auth.signOut();
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookieHeader()
    }
  });
}

export async function handleRegister(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  const forename = (body.forename || '').trim();
  const surname = (body.surname || '').trim();
  const phone_number = (body.phone_number || '').trim();
  const program_id = (body.program_id || '').trim();
  const cohort = (body.cohort || '').trim();

  if (!email || !password || !forename || !surname) {
    return json({ ok: false, error: 'missing_fields' }, 400);
  }

  const supabase = getSupabase(env);

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError) {
    const code = authError.message?.includes('already') ? 'email_exists' : 'register_failed';
    return json({ ok: false, error: code }, 400);
  }

  const user_id = generateUserId();
  const now = new Date().toISOString();

  // Create public.users profile
  await createUserProfile(supabase, {
    user_id,
    forename,
    surname,
    name: `${forename} ${surname}`.trim(),
    email,
    phone_number,
    program_id,
    cohort,
    role: 'STUDENT',
    active: true,
    must_change_password: false,
    created_utc: now,
    signup_source: 'SELF'
  });

  // Assign WELCOME_TRIAL subscription
  const trialProduct = await getProductById(supabase, 'WELCOME_TRIAL');
  if (trialProduct) {
    const durationDays = parseInt(trialProduct.duration_days || '7', 10);
    const expires = new Date(Date.now() + durationDays * 86400000).toISOString();
    await createSubscription(supabase, {
      subscription_id: generateSubscriptionId(),
      user_id,
      product_id: 'WELCOME_TRIAL',
      start_utc: now,
      expires_utc: expires,
      status: 'ACTIVE'
    });
  }

  // Sign in to get session
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !signInData.session) {
    return json({ ok: true, message: 'registered — please login' });
  }

  return new Response(JSON.stringify({ ok: true, user_id, email }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setCookieHeader(signInData.session.access_token, signInData.session.refresh_token)
    }
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
