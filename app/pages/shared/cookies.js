const COOKIE_NAME = 'qa_session';
const COOKIE_OPTIONS = 'HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800';

export function setCookieHeader(accessToken, refreshToken) {
  const val = btoa(JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }));
  return `${COOKIE_NAME}=${val}; ${COOKIE_OPTIONS}`;
}

export function clearCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function parseSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${COOKIE_NAME}=`)) {
      try {
        return JSON.parse(atob(trimmed.slice(COOKIE_NAME.length + 1)));
      } catch { return null; }
    }
  }
  return null;
}
