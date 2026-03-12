import { getSupabase, getUserByEmail, getUserById, getProductById, createUserProfile, createSubscription } from './db.js';

function generateUserId() {
  return 'U_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}
function generateSubscriptionId() {
  return 'S_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = 'Qa-';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function requireAdmin(request, env) {
  const { getSupabase } = await import('./db.js');
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/qa_session=([^;]+)/);
  if (!match) return null;
  try {
    const session = JSON.parse(atob(match[1]));
    const supabase = getSupabase(env);
    const { data } = await supabase.auth.getUser(session.access_token);
    if (!data?.user) return null;
    const profile = await getUserByEmail(supabase, data.user.email);
    if (!profile || (profile.role || '').toUpperCase() !== 'ADMIN') return null;
    return profile;
  } catch { return null; }
}

export async function handleCreateUser(request, env) {
  const caller = await requireAdmin(request, env);
  if (!caller) return json({ ok: false, error: 'forbidden' }, 403);

  const body = await request.json().catch(() => ({}));
  const forename = (body.forename || '').trim();
  const surname = (body.surname || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const phone_number = (body.phone_number || '').trim();
  const program_id = (body.program_id || '').trim();
  const cohort = (body.cohort || '').trim();
  const role = (body.role || 'STUDENT').toUpperCase();

  if (!forename || !surname || !email) {
    return json({ ok: false, error: 'missing_fields' }, 400);
  }

  const supabase = getSupabase(env);

  const existing = await getUserByEmail(supabase, email);
  if (existing) return json({ ok: false, error: 'email_exists' }, 400);

  const tempPassword = generateTempPassword();

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true
  });

  if (authError) return json({ ok: false, error: 'create_failed', detail: authError.message }, 400);

  const user_id = generateUserId();
  const now = new Date().toISOString();

  await createUserProfile(supabase, {
    user_id,
    forename,
    surname,
    name: `${forename} ${surname}`.trim(),
    email,
    phone_number,
    program_id,
    cohort,
    role,
    active: true,
    must_change_password: true,
    created_utc: now,
    signup_source: 'ADMIN'
  });

  // Assign WELCOME_TRIAL
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

  return json({ ok: true, user_id, email, temp_password: tempPassword, role });
}

export async function handleAssignProduct(request, env) {
  const caller = await requireAdmin(request, env);
  if (!caller) return json({ ok: false, error: 'forbidden' }, 403);

  const body = await request.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();
  const product_id = (body.product_id || '').trim().toUpperCase();

  if (!email || !product_id) return json({ ok: false, error: 'missing_fields' }, 400);

  const supabase = getSupabase(env);

  const user = await getUserByEmail(supabase, email);
  if (!user) return json({ ok: false, error: 'user_not_found' }, 404);
  if (!user.active) return json({ ok: false, error: 'user_inactive' }, 400);

  const product = await getProductById(supabase, product_id);
  if (!product) return json({ ok: false, error: 'product_not_found' }, 404);
  if ((product.status || '').toUpperCase() !== 'ACTIVE') return json({ ok: false, error: 'product_inactive' }, 400);

  const durationDays = parseInt(product.duration_days || '0', 10);
  if (!durationDays) return json({ ok: false, error: 'product_duration_invalid' }, 400);

  const now = new Date().toISOString();
  const expires = new Date(Date.now() + durationDays * 86400000).toISOString();
  const subscription_id = generateSubscriptionId();

  await createSubscription(supabase, {
    subscription_id,
    user_id: user.user_id,
    product_id,
    start_utc: now,
    expires_utc: expires,
    status: 'ACTIVE',
    source: 'ADMIN'
  });

  return json({ ok: true, subscription_id, user_id: user.user_id, product_id, expires_utc: expires });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
