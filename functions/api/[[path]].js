// ============================================================
// app/functions/api/[[path]].js
// QAcademy Nurses Hub — Pages Functions catchall router
//
// This file replaces the direct-to-Worker fetch calls.
// It runs on the SAME domain as the frontend (qacademy-alpha.pages.dev)
// so httpOnly cookies work correctly.
//
// Routes handled:
//   POST /api/login
//   POST /api/verify
//   POST /api/register
//   POST /api/reset/request
//   POST /api/reset/apply
//   POST /api/logout
// ============================================================

import { handleLogin, handleVerify, handleRegister, handleResetRequest, handleResetApply } from './auth.js';

// ------------------------------------------------------------
// Cookie helpers
// ------------------------------------------------------------

const COOKIE_NAME = 'qa_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

function buildSessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function getSessionCookie(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  return match ? match[1] : null;
}

// ------------------------------------------------------------
// Response helpers
// ------------------------------------------------------------

function jsonOk(data, extraHeaders = {}) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

function jsonFail(error, status = 200) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ------------------------------------------------------------
// Main Pages Function handler
// ------------------------------------------------------------

export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin':  request.headers.get('Origin') || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  }

  // Only POST is allowed for all API endpoints
  if (request.method !== 'POST') {
    return jsonFail('method_not_allowed', 405);
  }

  // Parse the path — strip /api prefix to get the route
  const url      = new URL(request.url);
  const pathname = url.pathname.replace(/\/$/, ''); // remove trailing slash

  // Parse JSON body — fail gracefully if malformed
  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return jsonFail('invalid_json', 400);
  }

  // ============================================================
  // POST /api/logout
  // No body needed — just clear the cookie
  // ============================================================
  if (pathname === '/api/logout') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookie()
      }
    });
  }

  // ============================================================
  // POST /api/login
  // Body: { email, password }
  // On success: sets httpOnly cookie, returns user profile
  // ============================================================
  if (pathname === '/api/login') {
    const result = await handleLogin(env, body);
    if (!result.ok) return jsonFail(result.error);

    // Set the session token in an httpOnly cookie
    // The token itself is NOT sent to the frontend
    return new Response(JSON.stringify({ ok: true, user: result.user }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': buildSessionCookie(result.token)
      }
    });
  }

  // ============================================================
  // POST /api/verify
  // No body needed — token comes from the cookie automatically
  // On success: returns user profile + access
  // ============================================================
  if (pathname === '/api/verify') {
    const token = getSessionCookie(request);
    if (!token) return jsonFail('no_session');

    const result = await handleVerify(env, token);
    if (!result.ok) return jsonFail(result.error);

    return jsonOk({ user: result.user, access: result.access, courses: result.courses, flags: result.flags });
  }

  // ============================================================
  // POST /api/register
  // Body: { forename, surname, email, password, phone_number?,
  //         program_id?, cohort?, username? }
  // Does NOT auto-login — user must go to login page after
  // ============================================================
  if (pathname === '/api/register') {
    const result = await handleRegister(env, body);
    if (!result.ok) return jsonFail(result.error);

    return jsonOk({ message: result.message });
  }

  // ============================================================
  // POST /api/reset/request
  // Body: { email }
  // Triggers Supabase password reset email
  // ============================================================
  if (pathname === '/api/reset/request') {
    const result = await handleResetRequest(env, body);
    if (!result.ok) return jsonFail(result.error);

    return jsonOk({ message: result.message });
  }

  // ============================================================
  // POST /api/reset/apply
  // Body: { access_token, new_password }
  // access_token comes from the URL fragment on the reset page
  // ============================================================
  if (pathname === '/api/reset/apply') {
    const result = await handleResetApply(env, body);
    if (!result.ok) return jsonFail(result.error);

    return jsonOk({ message: result.message });
  }

  // ============================================================
  // No route matched
  // ============================================================
  return jsonFail('not_found', 404);
}
