import { getSupabase } from '../../../../shared/db.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();
    if (!email) return json({ ok: false, error: 'missing_email' }, 400);

    const supabase = getSupabase(env);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://qacademy-alpha.pages.dev/reset-apply.html'
    });

    return json({ ok: true, message: 'If this account exists, a reset link has been sent.' });
  } catch (e) {
    return json({ ok: false, error: 'server_error', detail: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
