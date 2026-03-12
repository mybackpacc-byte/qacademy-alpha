import { handleLogin, handleVerify, handleLogout, handleRegister } from './auth.js';
import { handleResetRequest, handleResetApply } from './reset.js';
import { handleCreateUser, handleAssignProduct } from './admin.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://qacademy-alpha.pages.dev',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    let response;

    if (path === '/api/login' && request.method === 'POST')           response = await handleLogin(request, env);
    else if (path === '/api/verify' && request.method === 'POST')     response = await handleVerify(request, env);
    else if (path === '/api/logout' && request.method === 'POST')     response = await handleLogout(request, env);
    else if (path === '/api/register' && request.method === 'POST')   response = await handleRegister(request, env);
    else if (path === '/api/reset/request' && request.method === 'POST') response = await handleResetRequest(request, env);
    else if (path === '/api/reset/apply' && request.method === 'POST')   response = await handleResetApply(request, env);
    else if (path === '/api/admin/create-user' && request.method === 'POST')   response = await handleCreateUser(request, env);
    else if (path === '/api/admin/assign-product' && request.method === 'POST') response = await handleAssignProduct(request, env);
    else response = new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404 });

    // Add CORS headers to every response
    const newHeaders = new Headers(response.headers);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => newHeaders.set(k, v));
    return new Response(response.body, { status: response.status, headers: newHeaders });
  }
};
