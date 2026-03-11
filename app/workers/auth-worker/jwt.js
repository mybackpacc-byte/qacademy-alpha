// ============================================================
// jwt.js — JWT sign and verify
// Replaces the token system from auth_core_domain.gs
// Uses Web Crypto API (built into Cloudflare Workers)
// TTL: 12 hours — same as TOKEN_TTL_HOURS in AppScript
// ============================================================

const JWT_TTL_HOURS = 12;

/**
 * Sign a JWT with HS256.
 * payload: object of claims to include
 * secret: JWT_SECRET from Worker environment
 */
export async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };

  const now = Math.floor(Date.now() / 1000);
  const exp = now + (JWT_TTL_HOURS * 60 * 60);

  const fullPayload = {
    ...payload,
    iat: now,
    exp: exp
  };

  const headerB64  = btoa(JSON.stringify(header))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify(fullPayload))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signingInput = `${headerB64}.${payloadB64}`;

  const keyData = new TextEncoder().encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${signingInput}.${sigB64}`;
}

/**
 * Verify a JWT.
 * Returns the payload object if valid.
 * Returns null if invalid, expired, or tampered.
 */
export async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    // Re-compute signature
    const keyData = new TextEncoder().encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode signature from base64url
    const sigDecoded = atob(sigB64.replace(/-/g, '+').replace(/_/g, '/'));
    const sigBytes = Uint8Array.from(sigDecoded, c => c.charCodeAt(0));

    const valid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      sigBytes,
      new TextEncoder().encode(signingInput)
    );

    if (!valid) return null;

    // Decode payload
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) return null;

    return payload;

  } catch (e) {
    return null;
  }
}

/**
 * Extract JWT from request.
 * Checks Authorization header first, then request body.
 */
export function extractToken(request, body) {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return (body && body.token) ? String(body.token).trim() : '';
}
