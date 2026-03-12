import { getSupabase, getUserByEmail, getProductById, createUserProfile, createSubscription, generateUserId, generateSubscriptionId } from '../../../../shared/db.js';
import { parseSessionCookie } from '../../../../shared/cookies.js';

async function requireAdmin(request, env) {
  const session = parseSessionCookie(request.headers.get('Cookie') || '');
  if (!session?.access_token) return null;
  const supabase = getSupabase(env);
  const { data } = await supabase.auth.getUser(session.access_token);
  if (!data?.user) return null;
  const profile = await getUserByEmail(supabase, data.user.email);
  if (!profile || (profile.role || '').toUpperCase() !== 'ADMIN') return null;
  return profile;
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = 'Qa-';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
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

    if (!forename || !surname || !email) return json({ ok: false, error: 'missing_fields' }, 400);

    const supabase = getSupabase(env);
    const existing = await getUserByEmail(supabase, email);
    if (existing) return json({ ok: false, error: 'email_exists' }, 400);

    const tempPassword = generateTempPassword();
    const { error: authError } = await supabase.auth.admin.createUser({ email, password: tempPassword, email_confirm: true });
    if (authError) return json({ ok: false, error: 'create_failed', detail: authError.message }, 400);

    const user_id = generateUserId();
    const now = new Date().toISOString();
    await createUserProfile(supabase, { user_id, forename, surname, name: `${forename} ${surname}`.trim(), email, phone_number, program_id, cohort, role, active: true, must_change_password: true, created_utc: now, signup_source: 'ADMIN' });

    const trialProduct = await getProductById(supabase, 'WELCOME_TRIAL');
    if (trialProduct) {
      const days = parseInt(trialProduct.duration_days || '7', 10);
      await createSubscription(supabase, { subscription_id: generateSubscriptionId(), user_id, product_id: 'WELCOME_TRIAL', start_utc: now, expires_utc: new Date(Date.now() + days * 86400000).toISOString(), status: 'ACTIVE' });
    }

    return json({ ok: true, user_id, email, temp_password: tempPassword, role });
  } catch (e) {
    return json({ ok: false, error: 'server_error', detail: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
