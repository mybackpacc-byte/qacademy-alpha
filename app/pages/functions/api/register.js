import { getSupabase, getUserByEmail, createUserProfile, createSubscription, getProductById, getCourseIdsFromSubs, getActiveSubscriptions, buildProfile, generateUserId, generateSubscriptionId } from '../../../shared/db.js';
import { setCookieHeader } from '../../../shared/cookies.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const forename = (body.forename || '').trim();
    const surname = (body.surname || '').trim();
    const phone_number = (body.phone_number || '').trim();
    const program_id = (body.program_id || '').trim();
    const cohort = (body.cohort || '').trim();

    if (!email || !password || !forename || !surname) return json({ ok: false, error: 'missing_fields' }, 400);
    if (password.length < 8) return json({ ok: false, error: 'password_too_short' }, 400);

    const supabase = getSupabase(env);

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true
    });

    if (authError) {
      const code = authError.message?.includes('already') ? 'email_exists' : 'register_failed';
      return json({ ok: false, error: code }, 400);
    }

    const user_id = generateUserId();
    const now = new Date().toISOString();

    await createUserProfile(supabase, {
      user_id, forename, surname,
      name: `${forename} ${surname}`.trim(),
      email, phone_number, program_id, cohort,
      role: 'STUDENT', active: true,
      must_change_password: false,
      created_utc: now, signup_source: 'SELF'
    });

    const trialProduct = await getProductById(supabase, 'WELCOME_TRIAL');
    if (trialProduct) {
      const days = parseInt(trialProduct.duration_days || '7', 10);
      await createSubscription(supabase, {
        subscription_id: generateSubscriptionId(),
        user_id, product_id: 'WELCOME_TRIAL',
        start_utc: now,
        expires_utc: new Date(Date.now() + days * 86400000).toISOString(),
        status: 'ACTIVE'
      });
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError || !signInData.session) return json({ ok: true, message: 'registered — please login' });

    const subs = await getActiveSubscriptions(supabase, user_id);
    return new Response(JSON.stringify({
      ok: true,
      profile: buildProfile({ user_id, forename, surname, email, phone_number, program_id, cohort, role: 'STUDENT', must_change_password: false }),
      access: { course_ids: getCourseIdsFromSubs(subs) }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': setCookieHeader(signInData.session.access_token, signInData.session.refresh_token) }
    });
  } catch (e) {
    return json({ ok: false, error: 'server_error', detail: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
