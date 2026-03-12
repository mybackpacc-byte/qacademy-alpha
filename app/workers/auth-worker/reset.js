import { getSupabase } from './db.js';

export async function handleResetRequest(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = (body.email || '').trim().toLowerCase();

  if (!email) return json({ ok: false, error: 'missing_email' }, 400);

  const supabase = getSupabase(env);

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://qacademy-alpha.pages.dev/reset-apply.html'
  });

  // Always return success — don't leak whether email exists
  return json({ ok: true, message: 'If this account exists, a reset link has been sent.' });
}

export async function handleResetApply(request, env) {
  const body = await request.json().catch(() => ({}));
  const access_token = (body.access_token || '').trim();
  const new_password = body.new_password || '';

  if (!access_token || !new_password) {
    return json({ ok: false, error: 'missing_fields' }, 400);
  }

  if (new_password.length < 8) {
    return json({ ok: false, error: 'password_too_short' }, 400);
  }

  const supabase = getSupabase(env);

  const { error } = await supabase.auth.admin.updateUserById(
    (await supabase.auth.getUser(access_token)).data?.user?.id,
    { password: new_password }
  );

  if (error) return json({ ok: false, error: 'reset_failed' }, 400);

  return json({ ok: true, message: 'password_updated' });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
