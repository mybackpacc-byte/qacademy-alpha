import { getSupabase, getUserByEmail, getActiveSubscriptions, getCourseIdsFromSubs, buildProfile, logAuthEvent } from '../../../shared/db.js';
import { setCookieHeader } from '../../../shared/cookies.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';

    if (!email || !password) return json({ ok: false, error: 'missing_credentials' }, 400);

    const supabase = getSupabase(env);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      await logAuthEvent(supabase, { kind: 'LOGIN', identifier: email, ok: false, error_code: 'invalid_login', ip: request.headers.get('CF-Connecting-IP') || '' });
      return json({ ok: false, error: 'invalid_login' }, 401);
    }

    const profile = await getUserByEmail(supabase, email);
    if (!profile) return json({ ok: false, error: 'user_missing' }, 401);
    if (!profile.active) return json({ ok: false, error: 'user_inactive' }, 401);

    const subs = await getActiveSubscriptions(supabase, profile.user_id);
    const courseIds = getCourseIdsFromSubs(subs);

    await logAuthEvent(supabase, { kind: 'LOGIN', identifier: email, user_id: profile.user_id, ok: true, error_code: 'ok', ip: request.headers.get('CF-Connecting-IP') || '' });

    return new Response(JSON.stringify({
      ok: true,
      profile: buildProfile(profile),
      access: { course_ids: courseIds },
      flags: { is_admin: (profile.role || '').toUpperCase() === 'ADMIN' }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookieHeader(data.session.access_token, data.session.refresh_token)
      }
    });
  } catch (e) {
    return json({ ok: false, error: 'server_error', detail: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
