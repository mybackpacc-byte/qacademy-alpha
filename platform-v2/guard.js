
/**
 * QAcademy Alpha — guard.js
 * Include this script on every protected page.
 * It calls /auth/verify (which reads the HttpOnly cookie),
 * then either populates window.QA_USER or redirects to login.
 *
 * Usage:
 *   <script src="/guard.js"></script>
 *   The page will be hidden until auth is confirmed.
 *   After confirmation, document.body becomes visible and
 *   window.QA_USER is populated with the user profile.
 *
 * Optional: set window.QA_GUARD_ROLE = 'ADMIN' to restrict to a role.
 */
(function () {
  'use strict';

  const LOGIN_URL   = '/login.html';
  const VERIFY_URL  = '/auth/verify';

  // Hide the page immediately to prevent flash of protected content
  document.documentElement.style.visibility = 'hidden';

  async function runGuard() {
    try {
      const res = await fetch(VERIFY_URL, {
        method:      'GET',
        credentials: 'include'   // sends the HttpOnly cookie automatically
      });

      const data = await res.json();

      if (!data || !data.ok) {
        // Not authenticated — redirect to login, carry current URL as return_to
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

      // Expose user profile globally for the page to use
      window.QA_USER = data.user;

      // Show the page
      document.documentElement.style.visibility = 'visible';

      // Fire a custom event so pages can react when user is ready
      document.dispatchEvent(new CustomEvent('qa:user-ready', { detail: data.user }));

    } catch (err) {
      console.error('Guard error:', err);
      // On network error, show the page but don't populate QA_USER
      document.documentElement.style.visibility = 'visible';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runGuard);
  } else {
    runGuard();
  }
})();
