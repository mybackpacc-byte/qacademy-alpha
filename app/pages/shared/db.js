import { createClient } from '@supabase/supabase-js';

export function getSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });
}

export async function getUserByEmail(supabase, email) {
  const { data } = await supabase.from('users').select('*').eq('email', email.toLowerCase().trim()).single();
  return data || null;
}

export async function getUserById(supabase, userId) {
  const { data } = await supabase.from('users').select('*').eq('user_id', userId).single();
  return data || null;
}

export async function createUserProfile(supabase, profile) {
  const { data, error } = await supabase.from('users').insert(profile).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getActiveSubscriptions(supabase, userId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('*, products(*)')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .gt('expires_utc', new Date().toISOString());
  return data || [];
}

export async function createSubscription(supabase, sub) {
  const { data, error } = await supabase.from('subscriptions').insert(sub).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getProductById(supabase, productId) {
  const { data } = await supabase.from('products').select('*').eq('product_id', productId.toUpperCase().trim()).single();
  return data || null;
}

export async function logAuthEvent(supabase, event) {
  await supabase.from('auth_events').insert(event);
}

export function getCourseIdsFromSubs(subs) {
  const courseIds = [];
  for (const s of subs) {
    const courses = (s.products?.courses_included || '').split(',').map(c => c.trim()).filter(Boolean);
    for (const c of courses) {
      if (!courseIds.includes(c)) courseIds.push(c);
    }
  }
  return courseIds;
}

export function buildProfile(p) {
  return {
    user_id: p.user_id,
    name: p.name || [p.forename, p.surname].filter(Boolean).join(' '),
    forename: p.forename || '',
    surname: p.surname || '',
    email: p.email,
    phone_number: p.phone_number || '',
    program_id: p.program_id || '',
    cohort: p.cohort || '',
    avatar_url: p.avatar_url || '',
    role: p.role || '',
    must_change_password: p.must_change_password || false
  };
}

export function generateUserId() {
  return 'U_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

export function generateSubscriptionId() {
  return 'S_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}
