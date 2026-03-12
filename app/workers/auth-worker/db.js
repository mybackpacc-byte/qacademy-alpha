import { createClient } from '@supabase/supabase-js';

export function getSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });
}

export async function getUserByEmail(supabase, email) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single();
  if (error) return null;
  return data;
}

export async function getUserById(supabase, userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) return null;
  return data;
}

export async function createUserProfile(supabase, profile) {
  const { data, error } = await supabase
    .from('users')
    .insert(profile)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getActiveSubscriptions(supabase, userId) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, products(*)')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .gt('expires_utc', now);
  if (error) return [];
  return data || [];
}

export async function createSubscription(supabase, sub) {
  const { data, error } = await supabase
    .from('subscriptions')
    .insert(sub)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getProductById(supabase, productId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('product_id', productId.toUpperCase().trim())
    .single();
  if (error) return null;
  return data;
}

export async function logAuthEvent(supabase, event) {
  await supabase.from('auth_events').insert(event);
}
