// ============================================================
// app/functions/api/[[path]].js
// Cloudflare Pages Function — catches ALL /api/* requests
// QAcademy Nurses Hub — Phase 1 Auth
//
// Routes:
//   POST /api/login
//   POST /api/verify
//   POST /api/register
//   POST /api/reset/request
//   POST /api/reset/apply
//   POST /api/logout
// ============================================================

import { handleAuth } from './auth.js';

export async function onRequestPost(context) {
  return handleAuth(context.request, context.env);
}

export async function onRequestOptions() {
  // CORS preflight not needed (same domain) — but return 204 defensively
  return new Response(null, { status: 204 });
}
