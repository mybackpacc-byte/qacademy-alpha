import { getSupabase, getUserByEmail, getActiveSubscriptions, getCourseIdsFromSubs, buildProfile } from '../../../shared/db.js';
import { parseSessionCookie, clearCookieHeader } from '../../../shared/cookies.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const session = parseSessionCookie(request.headers.get('Cookie') || '');
    if (!session?.access_token) return json({ ok: false, error: 'no_session' }, 401);

    const supabase = getSupabase(env);
    const { data, error } = await supabase.auth.getUser(session.access_token);

    if (error || !data?.user) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookieHeader() }
      });
    }

    const profile = await getUserByEmail(supabase, data.user.email);
    if (!profile) return json({ ok: false, error: 'user_missing' }, 401);
    if (!profile.active) return json({ ok: false, error: 'user_inactive' }, 401);

    const subs = await getActiveSubscriptions(supabase, profile.user_id);
    const courseIds = getCourseIdsFromSubs(subs);

    return json({
      ok: true,
      profile: buildProfile(profile),
      access: { course_ids: courseIds },
      flags: { is_admin: (profile.role || '').toUpperCase() === 'ADMIN' }
    });
  } catch (e) {
    return json({ ok: false, error: 'server_error', detail: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
