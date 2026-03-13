/**
 * QAcademy Alpha — guard.js
 * Include on every protected page.
 * Calls /auth/verify which reads the HttpOnly cookie.
 * Populates window.QA_USER or redirects to login.
 *
 * Usage:
 *   <script src="/guard.js"><\/script>
 *
 * Optional role restriction:
 *   <script>window.QA_GUARD_ROLE = 'ADMIN';<\/script>
 *   <script src="/guard.js"><\/script>
 */
(function () {
  'use strict';

  const LOGIN_URL  = '/login.html';
  const VERIFY_URL = '/auth/verify';

  // Hide page immediately to prevent flash of protected content
  document.documentElement.style.visibility = 'hidden';

  async function runGuard() {
    try {
      const res = await fetch(VERIFY_URL, {
        method:      'GET',
        credentials: 'include',
      });

      const data = await res.json();

      if (!data || !data.ok) {
        const returnTo = encodeURIComponent(location.pathname + location.search);
        location.replace(`${LOGIN_URL}?return_to=${returnTo}`);
        return;
      }

      // Optional role check
      const requiredRole = window.QA_GUARD_ROLE || '';
      if (requiredRole && data.user.role !== requiredRole) {
        location.replace(LOGIN_URL);
        return;
      }

      // Expose user globally
      window.QA_USER = data.user;

      // Show page
      document.documentElement.style.visibility = 'visible';

      // Fire event so page scripts can react
      document.dispatchEvent(new CustomEvent('qa:user-ready', { detail: data.user }));

    } catch (err) {
      console.error('Guard error:', err);
      document.documentElement.style.visibility = 'visible';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runGuard);
  } else {
    runGuard();
  }
})();
