import { getSupabase } from '../../../../shared/db.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const access_token = (body.access_token || '').trim();
    const new_password = body.new_password || '';

    if (!access_token || !new_password) return json({ ok: false, error: 'missing_fields' }, 400);
    if (new_password.length < 8) return json({ ok: false, error: 'password_too_short' }, 400);

    const supabase = getSupabase(env);
    const { data: userData, error: userError } = await supabase.auth.getUser(access_token);
    if (userError || !userData?.user) return json({ ok: false, error: 'invalid_token' }, 401);

    const { error } = await supabase.auth.admin.updateUserById(userData.user.id, { password: new_password });
    if (error) return json({ ok: false, error: 'reset_failed' }, 400);

    return json({ ok: true, message: 'password_updated' });
  } catch (e) {
    return json({ ok: false, error: 'server_error', detail: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
