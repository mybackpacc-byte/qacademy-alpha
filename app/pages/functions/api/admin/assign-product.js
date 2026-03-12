import { getSupabase, getUserByEmail, getProductById, createSubscription, generateSubscriptionId } from '../../../../shared/db.js';
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

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
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

    const days = parseInt(product.duration_days || '0', 10);
    if (!days) return json({ ok: false, error: 'product_duration_invalid' }, 400);

    const now = new Date().toISOString();
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const subscription_id = generateSubscriptionId();

    await createSubscription(supabase, { subscription_id, user_id: user.user_id, product_id, start_utc: now, expires_utc: expires, status: 'ACTIVE', source: 'ADMIN' });

    return json({ ok: true, subscription_id, user_id: user.user_id, product_id, expires_utc: expires });
  } catch (e) {
    return json({ ok: false, error: 'server_error', detail: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
