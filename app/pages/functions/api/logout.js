import { getSupabase } from '../../../shared/db.js';
import { parseSessionCookie, clearCookieHeader } from '../../../shared/cookies.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const session = parseSessionCookie(request.headers.get('Cookie') || '');
  if (session?.access_token) {
    const supabase = getSupabase(env);
    await supabase.auth.signOut();
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearCookieHeader() }
  });
}
