/** ============================================================
 * QAcademy Portal — Auth Core Domain
 * Core business logic shared by all actions:
 * - User/product/subscription lookups
 * - Password + token primitives
 * - Rate limiting + auth event logging
 * - Google token verification
 * - Email rendering/sending helpers
 * - Subscription/trial logic
 * No HTTP, no _json, no API routing.
 * ============================================================ */


/* ========= auth_core_domain.gs ========= */

/*====This holds all core auth/domain helpers that don’t directly handle HTTP requests:====*/

/**
 * Log an auth event (login success/failure etc.) to SH_AUTH_EVENTS.
 * This must NEVER block login flow if it fails — errors are logged only.
 */
function _logAuthEvent_(args){
  try{
    var kind       = String(args.kind || '').trim();
    var identifier = String(args.identifier || '').trim();
    var user_id    = String(args.user_id || '').trim();
    var ip         = args.ip || '';
    var ua         = args.ua || '';
    var ok         = !!args.ok;
    var error_code = String(args.error_code || '').trim();
    var note       = String(args.note || '').trim();

    var sh = _sh(SH_AUTH_EVENTS);
    if (!sh) {
      Logger.log('auth_events sheet missing; skipping _logAuthEvent_');
      return;
    }

    var headers = _headers(sh);
    var event_id = Utilities.getUuid();
    var nowIso   = _iso(_now());
    var ip_hash  = ip ? _hashWebSafeSHA256(ip) : '';
    var ua_hash  = ua ? _hashWebSafeSHA256(ua) : '';

    var obj = {
      event_id:   event_id,
      ts_utc:     nowIso,
      kind:       kind,
      identifier: identifier,
      user_id:    user_id,
      ip_hash:    ip_hash,
      ua_hash:    ua_hash,
      ok:         ok,
      error_code: error_code,
      note:       note
    };

    _appendObj(sh, headers, obj);
  } catch (e){
    Logger.log('Error in _logAuthEvent_: ' + e);
  }
}


/**
 * Check login rate limit using TWO windows:
 *  - Short:  5 failures / 10 minutes
 *  - Long:  10 failures / 24 hours
 *
 * args:
 *   - identifier (email/username; may be empty)
 *   - ip         (raw IP string; may be empty)
 *   - kind       (LOGIN_EMAIL / LOGIN_USERNAME / LOGIN_GOOGLE)
 *   - user_id    (preferred key once we know the account; may be empty)
 *
 * returns:
 *   { blocked:false, window:null }  OR
 *   {
 *     blocked:true,
 *     window:'24h' | '10m',
 *     reason:'too_many_attempts_24h' | 'too_many_attempts',
 *     // counters for debugging/logging
 *     short_user:       <number>,
 *     short_identifier: <number>,
 *     short_ip:         <number>,
 *     long_user:        <number>,
 *     long_identifier:  <number>,
 *     long_ip:          <number>
 *   }
 */
function _checkLoginRateLimit_(args){
  try {
    var identifier = String(args.identifier || '').trim().toLowerCase();
    var ip         = args.ip || '';
    var kind       = String(args.kind || '').trim();
    var userId     = String(args.user_id || '').trim();

    var sh = _sh(SH_AUTH_EVENTS);
    if (!sh) {
      Logger.log('auth_events sheet missing; skipping _checkLoginRateLimit_');
      return { blocked:false, window:null };
    }

    var data   = _rows(SH_AUTH_EVENTS);
    var rows   = data.rows || [];
    var now    = _now();

    var cutoffShort = new Date(now.getTime() - 10 * 60 * 1000);       // 10 minutes
    var cutoffLong  = new Date(now.getTime() - 24 * 60 * 60 * 1000);  // 24 hours

    var ip_hash = ip ? _hashWebSafeSHA256(ip) : '';

    // Short window counters (10m)
    var short_user       = 0;
    var short_identifier = 0;
    var short_ip         = 0;

    // Long window counters (24h)
    var long_user        = 0;
    var long_identifier  = 0;
    var long_ip          = 0;

    rows.forEach(function(r){
      // Only consider LOGIN_* events
      var k = String(r.kind || '');
      if (!/^LOGIN_/i.test(k)) return;

      // Only failures (ok === true means success)
      if (_toBool_(r.ok)) return;

      var t = _parseUtc_(r.ts_utc);
      if (!t) return;

      var inLong  = t >= cutoffLong;
      var inShort = t >= cutoffShort;

      if (!inLong && !inShort) return; // outside both windows

      // Per-user bucket (strongest)
      if (userId) {
        var rUid = String(r.user_id || '').trim();
        if (rUid && rUid === userId) {
          if (inLong)  long_user++;
          if (inShort) short_user++;
        }
      }

      // Per-identifier (username/email) bucket
      if (identifier) {
        var rId = String(r.identifier || '').trim().toLowerCase();
        if (rId === identifier) {
          if (inLong)  long_identifier++;
          if (inShort) short_identifier++;
        }
      }

      // Per-IP bucket
      if (ip_hash) {
        var rIpHash = String(r.ip_hash || '');
        if (rIpHash === ip_hash) {
          if (inLong)  long_ip++;
          if (inShort) short_ip++;
        }
      }
    });

    // Thresholds
    var SHORT_LIMIT = 5;   // 5 in 10 minutes
    var LONG_LIMIT  = 10;  // 10 in 24 hours

    var blockedShort, blockedLong;

    if (userId) {
      // If we know the user, we primarily use user_id + IP
      blockedShort = (short_user >= SHORT_LIMIT) || (short_ip >= SHORT_LIMIT);
      blockedLong  = (long_user  >= LONG_LIMIT)  || (long_ip  >= LONG_LIMIT);
    } else {
      // For unknown users, fallback to identifier + IP
      blockedShort = (short_identifier >= SHORT_LIMIT) || (short_ip >= SHORT_LIMIT);
      blockedLong  = (long_identifier  >= LONG_LIMIT)  || (long_ip  >= LONG_LIMIT);
    }

    // 1) Enforce 24h lock first (stronger)
    if (blockedLong) {
      return {
        blocked: true,
        window:  '24h',
        reason:  'too_many_attempts_24h',
        short_user:       short_user,
        short_identifier: short_identifier,
        short_ip:         short_ip,
        long_user:        long_user,
        long_identifier:  long_identifier,
        long_ip:          long_ip
      };
    }

    // 2) Then enforce short 10m lock
    if (blockedShort) {
      return {
        blocked: true,
        window:  '10m',
        reason:  'too_many_attempts',
        short_user:       short_user,
        short_identifier: short_identifier,
        short_ip:         short_ip,
        long_user:        long_user,
        long_identifier:  long_identifier,
        long_ip:          long_ip
      };
    }

    // 3) No limits hit
    return {
      blocked:false,
      window:null,
      reason:'',
      short_user:       short_user,
      short_identifier: short_identifier,
      short_ip:         short_ip,
      long_user:        long_user,
      long_identifier:  long_identifier,
      long_ip:          long_ip
    };

  } catch (e){
    Logger.log('Error in _checkLoginRateLimit_: ' + e);
    // Fail open: if the limiter breaks, do not block logins.
    return { blocked:false, window:null };
  }
}


function _renderEmailFromDrive_(fileId, data){
  if (!fileId) throw new Error('missing_template_id');

  var file = DriveApp.getFileById(fileId);

  // Force UTF-8 decode so emojis and non-ASCII characters render correctly
  var html = file.getBlob().getDataAsString('UTF-8');

  // Ensure template declares UTF-8 (defensive; helps downstream processing)
  if (!/<meta\s+charset=/i.test(html)) {
    if (/<head(\s[^>]*)?>/i.test(html)) {
      html = html.replace(/<head(\s[^>]*)?>/i, function(m){
        return m + '\n<meta charset="UTF-8">';
      });
    } else {
      html = '<meta charset="UTF-8">\n' + html;
    }
  }

  if (!data) return html;

  Object.keys(data).forEach(function(key){
    var val = (data[key] == null ? '' : String(data[key]));
    var pattern = new RegExp('{{\\s*' + key + '\\s*}}', 'g');
    html = html.replace(pattern, val);
  });

  html = html.replace(/{{\s*[\w.]+\s*}}/g, '');

  return html;
}


/**
 * Send a welcome email using Drive-based HTML templates.
 *
 * mode: 'ADMIN' or 'SELF'
 * extra:
 *   - tempPassword (for ADMIN mode)
 *   - productName  (optional, for ADMIN mode)
 */
function _sendWelcomeEmailForUser_(userObj, mode, extra){
  extra = extra || {};
  if (!userObj || !userObj.email) return;

  var email = String(userObj.email || '').trim();
  if (!email) return;

  var fullName  = userObj.name || [userObj.forename, userObj.surname].filter(Boolean).join(' ');
  var firstName = (userObj.forename || fullName || '').trim();
  var displayName = firstName || fullName || '';

  var username = String(userObj.username || '').trim().toLowerCase();

  // Base login URL
  var loginUrl = LOGIN_PAGE_URL;

  // Prefill login URL for Option A (works with your patched login page)
  var loginUrlWithUsername = loginUrl;
  if (username) {
    var sep = (loginUrl.indexOf('?') >= 0) ? '&' : '?';
    loginUrlWithUsername = loginUrl + sep + 'reg=1&u=' + encodeURIComponent(username);
  }

  var templateId;
  var subject;

  // IMPORTANT: include username in data, but do not require templates to use it
  var data = {
    name:     displayName,
    email:    email,
    username: username,               // NEW (safe even if template ignores it)
    loginUrl: loginUrlWithUsername    // CHANGED: send the prefill link
  };

  if (mode === 'ADMIN') {
    templateId = WELCOME_ADMIN_TEMPLATE_ID;
    subject    = 'Welcome to QAcademy – Your login details';

    data.tempPassword = extra.tempPassword || '';
    data.productName  = extra.productName || 'Your QAcademy access';
  } else {
    templateId = WELCOME_SELF_TEMPLATE_ID;
    subject    = 'Welcome to QAcademy – You’re all set';
  }

  // Plain-text fallback (always available)
  var plainLines = [];
  plainLines.push(displayName ? ('Hi ' + displayName + ',') : 'Hi,');
  plainLines.push('');

  if (mode === 'ADMIN') {
    plainLines.push('Your QAcademy account has been created.');
    plainLines.push('Email: ' + email);
    if (username) plainLines.push('Username: ' + username);
    if (data.tempPassword) plainLines.push('Temporary password: ' + data.tempPassword);
  } else {
    plainLines.push('Thank you for creating your QAcademy account.');
    plainLines.push('Email: ' + email);
    if (username) plainLines.push('Username: ' + username);
  }

  plainLines.push('');
  plainLines.push('Login here: ' + loginUrlWithUsername);
  plainLines.push('');
  plainLines.push('If you did not expect this email, you can ignore it.');
  plainLines.push('');
  plainLines.push(BRAND_NAME);

  var plainBody = plainLines.join('\n');

  // HTML body: try template, but NEVER abort email sending if it fails
  var htmlBody = '';
  var usedTemplate = false;

  try {
    htmlBody = _renderEmailFromDrive_(templateId, data);
    usedTemplate = !!htmlBody;
  } catch (e) {
    Logger.log('Welcome email template render failed for ' + email + ': ' + e);
    usedTemplate = false;
  }

  // If template failed (or returned empty), use a safe minimal HTML fallback
  if (!usedTemplate) {
    var safeLoginLink = String(loginUrlWithUsername || loginUrl || '').trim();
    var safeUser = username ? ('<p><b>Username:</b> ' + _escapeHtml_(username) + '</p>') : '';
    var safeTemp = (mode === 'ADMIN' && data.tempPassword)
      ? ('<p><b>Temporary password:</b> ' + _escapeHtml_(data.tempPassword) + '</p>')
      : '';

    htmlBody =
      '<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#111827;">' +
        '<p>' + (displayName ? ('Hi ' + _escapeHtml_(displayName) + ',') : 'Hi,') + '</p>' +
        (mode === 'ADMIN'
          ? '<p>Your QAcademy account has been created.</p>'
          : '<p>Thank you for creating your QAcademy account.</p>') +
        '<p><b>Email:</b> ' + _escapeHtml_(email) + '</p>' +
        safeUser +
        safeTemp +
        '<p><a href="' + _escapeHtml_(safeLoginLink) + '" style="color:#0b7a75;text-decoration:underline;font-weight:600;">Login to QAcademy</a></p>' +
        '<p style="font-size:12px;color:#6b7280;">If you did not expect this email, you can ignore it.</p>' +
        '<p style="margin-top:16px;font-size:11px;color:#9ca3af;">' + _escapeHtml_(BRAND_NAME) + '</p>' +
      '</div>';
  }

  try {
    _qaSendEmail_({
      to: email,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: BRAND_NAME
    });
  } catch (e) {
    Logger.log('Welcome email send failed for ' + email + ': ' + e);
  }

}
/**
 * TA Welcome email — template must render (no HTML fallback).
 * Best-effort: never throws to caller.
 */
function _emailTaWelcome_(args){
  try{
    var toEmail = String((args && args.email) || '').trim().toLowerCase();
    if(!toEmail) return { ok:false, error:'missing_email' };

    var name     = String((args && args.name) || '').trim();
    var username = String((args && args.username) || '').trim().toLowerCase();

    // CTA: send them to Login (prefilled username)
    var loginUrl = String(LOGIN_PAGE_URL || '').trim();
    var ctaUrl = loginUrl;
    if (loginUrl && username) {
      var sep = (loginUrl.indexOf('?') >= 0) ? '&' : '?';
      ctaUrl = loginUrl + sep + 'reg=1&u=' + encodeURIComponent(username);
    }

    var htmlBody = _renderEmailFromDrive_(TPL_TA_WELCOME, {
      name: name || 'there',
      cta_url: ctaUrl,
      cta_text: 'Continue',
      support_email: String(SUPPORT_EMAIL || ''),
      year: String(new Date().getFullYear())
    });

    var subject = 'Welcome to QAcademy • Teacher Assess';

    // Plain text can be short
    var plainBody =
      (name ? ('Hi ' + name + ',\n\n') : 'Hi,\n\n') +
      'Your Teacher Assess account has been created.\n' +
      (ctaUrl ? ('Continue: ' + ctaUrl + '\n\n') : '\n') +
      BRAND_NAME;

    return _qaSendEmail_({
      to: toEmail,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      name: BRAND_NAME
    });

  } catch(e){
    Logger.log('TA welcome email failed (render/send): ' + e);
    return { ok:false, error:String(e) };
  }
}
/** Minimal HTML escaper to avoid breaking fallback HTML */
function _escapeHtml_(s){
  s = String(s == null ? '' : s);
  return s
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

/**
 * Gmail sender wrapper (safer alias handling + consistent options).
 * - Uses GmailApp instead of MailApp.
 * - Uses replyTo by default (best deliverability).
 * - Only sets "from" if the alias exists in Gmail settings.
 */
function _qaSendEmail_(args){
  try{
    var to       = String(args.to || '').trim();
    var subject  = String(args.subject || '').trim();
    var body     = String(args.body || '');      // plain text fallback (required)
    var htmlBody = args.htmlBody;                // optional
    var name     = String(args.name || BRAND_NAME || '').trim();

    if(!to || !subject) return;

    // Defaults from config (deliverability-safe)
    var replyTo  = String(args.replyTo || SUPPORT_EMAIL || '').trim();

    // Optional: attempt to set From only if alias is verified
    var fromWanted = String(args.from || FROM_EMAIL || '').trim();
    var fromSafe = '';

    if (fromWanted) {
      try{
        var aliases = GmailApp.getAliases() || [];
        var ok = aliases.map(String).map(s => s.toLowerCase()).indexOf(fromWanted.toLowerCase()) >= 0;
        if (ok) fromSafe = fromWanted;
        else Logger.log('Alias not verified; skipping from=' + fromWanted);
      } catch(e){
        Logger.log('Could not read Gmail aliases; skipping from. Err=' + e);
      }
    }

    var opts = {};
    if (name) opts.name = name;
    if (replyTo) opts.replyTo = replyTo;
    if (fromSafe) opts.from = fromSafe;
    if (htmlBody) opts.htmlBody = String(htmlBody);

    GmailApp.sendEmail(to, subject, body, opts);
    return { ok:true };

  } catch(e){
    Logger.log('_qaSendEmail_ failed: ' + e);
    return { ok:false, error:String(e) };
  }
}



/**
 * Send subscription email for:
 * - Admin assignment (ASSIGNED)
 * - First-time paid activation (ACTIVATED)
 * - Renewal/extension/upgrade messaging (UPDATED)
 *
 * ctx (optional):
 *  { source:'PAYSTACK'|'ADMIN'|..., reference:'...', event:'ASSIGNED'|'ACTIVATED'|'UPDATED' }
 */
function _sendProductAssignedEmail_(user, product, subObj, ctx) {
  try {
    if (!user || !user.email) return;

    var email = String(user.email || '').trim();
    if (!email) return;

    ctx = ctx || {};
    var activationSource = String(ctx.source || '').trim();
    var reference        = String(ctx.reference || '').trim();

    // ✅ New: event controls wording (keeps one template for admin + payments)
    var event = String(ctx.event || '').trim().toUpperCase();

    // Backward-compatible default:
    // - Keep your old messaging unless the caller explicitly sets event.
    if (!event) event = 'ACTIVATED';

    // Friendly display name (avoid "Hi ," in template)
    var displayName = (user.forename || user.name || '').trim();
    if (!displayName) displayName = 'there';

    // Format expiry date
    var expIso  = subObj && subObj.expires_utc;
    var expDate = expIso ? _parseUtc_(expIso) : null;
    var tz      = Session.getScriptTimeZone() || 'Etc/UTC';
    var expiryDateStr = expDate
      ? Utilities.formatDate(expDate, tz, 'd MMM yyyy')
      : 'No fixed expiry';

    // Product fields
    var productName    = product && product.name ? String(product.name) : String(subObj.product_id || '');
    var productSummary = product && product.description ? String(product.description) : '';

    // ✅ Wording map (single template, different copy)
    var subject, emailTitle, badgeText, headline, subtitle, introLine, plainStatusLine;

    if (event === 'UPDATED') {
      subject         = 'QAcademy access updated';
      emailTitle      = 'QAcademy access updated';
      badgeText       = 'Access updated';
      headline        = 'Your QAcademy access has been updated';
      subtitle        = 'Your subscription has been updated on your QAcademy account.';
      introLine       = 'Your access has been updated for the following product:';
      plainStatusLine = 'Your QAcademy access has been updated.';
    } else if (event === 'ASSIGNED') {
      subject         = 'QAcademy access granted';
      emailTitle      = 'QAcademy access granted';
      badgeText       = 'Access granted';
      headline        = 'Access has been granted to your QAcademy account';
      subtitle        = 'A subscription has been added to your QAcademy account.';
      introLine       = 'You have been assigned the following product on your QAcademy account:';
      plainStatusLine = 'Your QAcademy access has been granted.';
    } else {
      // ACTIVATED (default / legacy wording)
      subject         = 'Your QAcademy access is now active';
      emailTitle      = 'Your QAcademy access is now active';
      badgeText       = 'Access activated';
      headline        = 'Your QAcademy access is now active';
      subtitle        = 'A new subscription has been added to your QAcademy account.';
      introLine       = 'You have just been assigned the following product on your QAcademy account:';
      plainStatusLine = 'Your QAcademy access is now active.';
    }

    // Course list HTML from products.courses_included → SH_COURSES
    var courseListHtml = '';
    try {
      if (product && product.courses_included) {
        var ids = _parseCoursesIncluded_(product.courses_included);
        if (ids && ids.length) {
          var courseMeta = _getCoursesByIds(ids);
          if (courseMeta && courseMeta.length) {
            var liParts = courseMeta.map(function(c) {
              var label = (c.title || c.course_id || '').toString();
              return '<li>' + label + '</li>';
            });
            courseListHtml = '<ul>' + liParts.join('') + '</ul>';
          }
        }
      }
    } catch (e) {
      Logger.log('Error building courseListHtml: ' + e);
    }
    if (!courseListHtml) {
      courseListHtml = '<ul><li>This product unlocks one or more courses on your dashboard.</li></ul>';
    }

    // Reference line (optional)
    var refLinePlain = reference ? ('Reference: ' + reference + '\n') : '';
    var refHtml = reference
      ? ('<div style="margin:10px 0;padding:10px 12px;border:1px dashed rgba(11,122,117,.35);border-radius:12px;background:rgba(11,122,117,.05);">' +
         '<div style="font-size:12px;color:#51605e;font-weight:700;">Payment reference</div>' +
         '<div style="font-size:16px;font-weight:800;color:#1f2a28;">' + reference + '</div>' +
         '</div>')
      : '';

    // Plain-text fallback
    var greeting = displayName ? ('Hi ' + displayName + ',') : 'Hi,';
    var plainBody =
      greeting + '\n\n' +
      plainStatusLine + '\n\n' +
      'Product: ' + productName + '\n' +
      (productSummary ? ('Details: ' + productSummary + '\n') : '') +
      'Access until: ' + expiryDateStr + '\n' +
      (activationSource ? ('Updated via: ' + activationSource + '\n') : '') +
      refLinePlain + '\n' +
      'Go to your dashboard:\n' +
      DASHBOARD_URL + '\n\n' +
      BRAND_NAME;

    // Render HTML from Drive template
    var htmlBody = null;
    try {
      htmlBody = _renderEmailFromDrive_(PRODUCT_ASSIGNED_TEMPLATE_ID, {
        // ✅ New dynamic copy fields used by the updated HTML template
        emailTitle:           emailTitle,
        badgeText:            badgeText,
        headline:             headline,
        subtitle:             subtitle,
        introLine:            introLine,

        // Existing fields
        name:                 displayName,
        productName:          productName,
        productSummary:       productSummary,
        expiryDate:           expiryDateStr,
        courseListHtml:       courseListHtml,
        dashboardUrl:         DASHBOARD_URL,
        activationSource:     activationSource,
        reference:            reference,
        referenceHtml:        refHtml,

        licensureTelegramUrl: LICENSURE_TELEGRAM_URL,
        telegramUrl:          TELEGRAM_URL,
        whatsappUrl:          WHATSAPP_URL,
        tiktokUrl:            TIKTOK_URL,
        linktreeUrl:          LINKTREE_URL,
        brandName:            BRAND_NAME
      });
    } catch (e) {
      Logger.log('Product assigned email template render failed: ' + e);
      htmlBody = null;
    }

    _qaSendEmail_({
      to: email,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody || '',
      name: BRAND_NAME
    });

  } catch (err) {
    Logger.log('Error in _sendProductAssignedEmail_: ' + err);
  }
}



/**
 * Send "Subscription Expiring Soon" email using subscription_expiring_v1.html.
 *
 * @param {Object} user      - user row object from SH_USERS
 * @param {Object} product   - product row object from SH_PRODUCTS
 * @param {Object} subObj    - subscription object (the row or constructed object)
 * @param {number} daysLeft  - integer days remaining until expiry
 */
function _sendSubscriptionExpiringEmail_(user, product, subObj, daysLeft) {
  try {
    if (!user || !user.email) return;

    var email = String(user.email || '').trim();
    if (!email) return;

    var displayName = (user.forename || user.name || '').trim();
    var subject     = 'Your QAcademy access is ending soon';

    // Format expiry date
    var expIso  = subObj && subObj.expires_utc;
    var expDate = expIso ? _parseUtc_(expIso) : null;
    var tz      = Session.getScriptTimeZone() || 'Etc/UTC';
    var expiryDateStr = expDate
      ? Utilities.formatDate(expDate, tz, 'd MMM yyyy')
      : 'No fixed expiry';

    // Normalise daysLeft to safe integer
    var days = (typeof daysLeft === 'number' && !isNaN(daysLeft))
      ? Math.max(daysLeft, 0)
      : 0;

    // Product fields
    var productName    = product && product.name ? String(product.name) : String(subObj.product_id || '');
    var productSummary = product && product.description ? String(product.description) : '';

    // Course list HTML from products.courses_included → SH_COURSES
    var courseListHtml = '';
    try {
      if (product && product.courses_included) {
        var ids = _parseCoursesIncluded_(product.courses_included);
        if (ids && ids.length) {
          var courseMeta = _getCoursesByIds(ids); // uses SH_COURSES
          if (courseMeta && courseMeta.length) {
            var liParts = courseMeta.map(function(c) {
              var label = (c.title || c.course_id || '').toString();
              return '<li>' + label + '</li>';
            });
            courseListHtml = '<ul>' + liParts.join('') + '</ul>';
          }
        }
      }
    } catch (e) {
      Logger.log('Error building courseListHtml (expiry): ' + e);
    }

    if (!courseListHtml) {
      courseListHtml = '<ul><li>This subscription unlocks one or more courses on your dashboard.</li></ul>';
    }

    // Plain-text fallback
    var greeting = displayName ? ('Hi ' + displayName + ',') : 'Hi,';
    var plainBody =
      greeting + '\n\n' +
      'One of your QAcademy subscriptions is close to its expiry date.\n\n' +
      'Product: ' + productName + '\n' +
      (productSummary ? ('Details: ' + productSummary + '\n') : '') +
      'Days remaining: ' + days + '\n' +
      'Access ends on: ' + expiryDateStr + '\n\n' +
      'You can open your dashboard here:\n' +
      DASHBOARD_URL + '\n\n' +
      'If you need to renew, please visit:\n' +
      SUBSCRIPTION_RENEW_URL + '\n\n' +
      BRAND_NAME;

    // Render HTML from Drive template
    var htmlBody = null;
    try {
      htmlBody = _renderEmailFromDrive_(SUBSCRIPTION_EXPIRING_TEMPLATE_ID, {
        name:               displayName,
        daysLeft:           String(days),
        expiryDate:         expiryDateStr,
        productName:        productName,
        productSummary:     productSummary,
        courseListHtml:     courseListHtml,
        renewUrl:           SUBSCRIPTION_RENEW_URL,
        dashboardUrl:       DASHBOARD_URL,
        licensureTelegramUrl: LICENSURE_TELEGRAM_URL,
        telegramUrl:        TELEGRAM_URL,
        whatsappUrl:        WHATSAPP_URL,
        tiktokUrl:          TIKTOK_URL,
        linktreeUrl:        LINKTREE_URL,
        brandName:          BRAND_NAME
      });
    } catch (e) {
      Logger.log('Subscription expiring email template render failed: ' + e);
      htmlBody = null;
    }

    // Send email (fallback to plain-only if template failed)
    _qaSendEmail_({
      to: email,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody || '',
      name: BRAND_NAME
    });


  } catch (err) {
    Logger.log('Error in _sendSubscriptionExpiringEmail_: ' + err);
  }
}


/* ========= Data lookups ========= */
function _getUserByUsername(username){
  const {rows} = _rows(SH_USERS);
  const u = String(username||'').trim().toLowerCase();
  return rows.find(r => String(r.username||'').trim().toLowerCase() === u);
}
// lookup by email (email login + Google Sign-In + admin)
function _getUserByEmail(email){
  const {rows} = _rows(SH_USERS);
  const e = String(email||'').trim().toLowerCase();
  return rows.find(r => String(r.email||'').trim().toLowerCase() === e);
}

function _getUserRowIndex(username){ return _findRowIndexBy(_sh(SH_USERS), 'username', username); }
function _getUserById(user_id){
  const {rows} = _rows(SH_USERS);
  return rows.find(r => String(r.user_id||'') === String(user_id||''));
}

// Helper: get set of existing usernames (lowercased)
function _getExistingUsernameSet_(){
  const {rows} = _rows(SH_USERS);
  const set = new Set();
  rows.forEach(function(r){
    var u = String(r.username || '').trim().toLowerCase();
    if(u) set.add(u);
  });
  return set;
}

// Helper: base from forename (lowercase, alnum, starts with letter, truncated)
function _generateUsernameBaseFromForename_(forename){
  var base = String(forename || '').trim().toLowerCase();
  base = base.replace(/[^a-z0-9]/g, '');
  if(!base) base = 'user';
  if(!/^[a-z]/.test(base)) base = 'u' + base;
  if(base.length > 12) base = base.slice(0,12);
  return base;
}

// Helper: generate unique username from forename
function _generateUniqueUsernameFromForename_(forename){
  var existing = _getExistingUsernameSet_();
  var base = _generateUsernameBaseFromForename_(forename);

  for(var i=1;i<=99;i++){
    var suffix = (i < 10 ? '0'+i : String(i));
    var candidate = base + suffix;
    if(candidate.length > 20){
      candidate = candidate.slice(0,20);
    }
    if(!existing.has(candidate)){
      return candidate;
    }
  }
  // Fallback (very unlikely)
  var fallback = base.slice(0,15) + Math.floor(Math.random()*10000).toString().padStart(4,'0');
  fallback = fallback.slice(0,20);
  if(!existing.has(fallback)){
    return fallback;
  }
  throw new Error('could_not_generate_username');
}

// Helper: username format validator
function _isValidUsername_(uname){
  return /^[a-z][a-z0-9_]{0,19}$/.test(String(uname || ''));
}

// product lookup by product_id
function _getProductById(product_id){
  const {rows} = _rows(SH_PRODUCTS);
  const pid = String(product_id || '').trim().toUpperCase();
  if(!pid) return null;
  return rows.find(r => String(r.product_id || '').trim().toUpperCase() === pid) || null;
}

function _putToken(rec){ const {headers, sh} = _rows(SH_TOKENS); _appendObj(sh, headers, rec); }
function _findActiveToken(token){
  const {rows} = _rows(SH_TOKENS);
  return rows.find(r => r.token===token && String(r.active).toLowerCase()==='true');
}
function _deactivateToken(token){
  const {headers, sh} = _rows(SH_TOKENS);
  const idx = _findRowIndexBy(sh,'token',token);
  if(idx>0){
    const row = sh.getRange(idx,1,1,headers.length).getValues()[0];
    const obj = _rowToObj(headers,row);
    obj.active = false;
    obj.last_seen_utc = _iso(_now());
    _updateObj(sh, headers, idx, obj);
  }
}

/**
 * Enforce max N active tokens per user.
 * We silently deactivate the oldest active, unexpired token when limit is exceeded.
 */
function _enforceTokenLimitForUser(user_id, maxActive){
  const {rows} = _rows(SH_TOKENS);
  const now = _now();
  const uid = String(user_id||'').trim();

  // Find all active, unexpired tokens for this user
  const activeTokens = rows.filter(r => {
    if (String(r.user_id||'').trim() !== uid) return false;
    if (!_toBool_(r.active)) return false;
    const exp = _parseUtc_(r.expires_utc);
    if (exp && now >= exp) return false;
    return true;
  });

  if (activeTokens.length < maxActive) return;

  // Sort by issued_utc (oldest first)
  activeTokens.sort((a,b) => {
    const da = _parseUtc_(a.issued_utc) || new Date(0);
    const db = _parseUtc_(b.issued_utc) || new Date(0);
    return da - db;
  });

  const toDeactivate = activeTokens[0]; // oldest
  if (toDeactivate && toDeactivate.token) {
    _deactivateToken(toDeactivate.token);
  }
}



/* ========= Auth primitives ========= */
function _verifyPassword(user, plain){
  if(!user || !user.salt || !user.password_hash) return false;
  return _hashWebSafeSHA256(String(user.salt)+String(plain)) === user.password_hash;
}

/**
 * NEW: extended to store device_label, login_via and kind in tokens sheet.
 * kind = "LOGIN" for normal sessions, "RESET" for password reset links, etc.
 */
/**
 * NEW: extended to store device_label, login_via and kind in tokens sheet.
 * kind = "LOGIN" for normal sessions, "RESET" for password reset links, etc.
 */
function _issueToken(user_id, uaHash, ipHash, deviceLabel, loginVia, kind){
  const now = _now();

  // Normalise kind and decide TTL
  var tokenKind = (kind || 'LOGIN').toString().trim().toUpperCase();
  var exp;

  if (tokenKind === 'RESET') {
    // Use shorter TTL for password reset links (e.g. 1 hour)
    var minutes = (typeof RESET_TOKEN_TTL_MINUTES === 'number' && RESET_TOKEN_TTL_MINUTES > 0)
      ? RESET_TOKEN_TTL_MINUTES
      : 60; // safe default

    exp = new Date(now.getTime() + minutes * 60 * 1000);
  } else {
    // All normal login/admin tokens use TOKEN_TTL_HOURS
    exp = _addHours(now, TOKEN_TTL_HOURS);
  }

  const token = _generateToken();

  _putToken({
    token:        token,
    user_id:      user_id,
    kind:         tokenKind,
    issued_utc:   _iso(now),
    expires_utc:  _iso(exp),
    ua_hash:      uaHash || '',
    ip_hash:      ipHash || '',
    device_label: deviceLabel || '',
    login_via:    loginVia || '',
    last_seen_utc:_iso(now),
    active:       true
  });

  return { token: token, expires_utc: _iso(exp) };
}



function _checkToken(token){
  const t = _findActiveToken(token);
  if(!t) return {ok:false, reason:'not_found'};
  if(new Date(t.expires_utc) < _now()) return {ok:false, reason:'expired'};
  // touch last_seen_utc
  const {headers, sh} = _rows(SH_TOKENS);
  const idx = _findRowIndexBy(sh,'token', token);
  if(idx>0){
    const row = sh.getRange(idx,1,1,headers.length).getValues()[0];
    const obj = _rowToObj(headers,row);
    obj.last_seen_utc = _iso(_now());
    _updateObj(sh, headers, idx, obj);
  }
  return {ok:true, token:t};
}

/* ========= Google ID Token Verification ========= */

/**
 * Verify a Google ID token (JWT) using Google's tokeninfo endpoint.
 * - Ensures token is valid and not expired.
 * - Ensures aud (client) matches our GOOGLE_CLIENT_ID.
 * - Ensures issuer is accounts.google.com.
 * - Ensures email is verified.
 */
function _verifyGoogleIdToken_(idToken){
  if (!idToken) throw new Error('missing_id_token');

  var url  = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = resp.getResponseCode();
  if (code !== 200) {
    throw new Error('google_token_invalid');
  }

  var payload = {};
  try {
    payload = JSON.parse(resp.getContentText() || '{}');
  } catch (e) {
    throw new Error('google_token_parse_error');
  }

  // Check audience (must match our client ID)
  var aud = String(payload.aud || '');
  if (aud !== GOOGLE_CLIENT_ID) {
    throw new Error('google_audience_mismatch');
  }

  // Check issuer
  var iss = String(payload.iss || '');
  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') {
    throw new Error('google_issuer_invalid');
  }

  // Check expiry (exp is in seconds since epoch)
  var exp = parseInt(payload.exp, 10);
  if (exp && Math.floor(Date.now()/1000) > exp) {
    throw new Error('google_token_expired');
  }

  // Require verified email
  var emailVerified = String(payload.email_verified || '').toLowerCase();
  if (emailVerified !== 'true') {
    throw new Error('google_email_not_verified');
  }

  return payload;
}

/* ========= Courses & Enrollments (legacy) ========= */
function _getCoursesByIds(ids){
  const {rows} = _rows(SH_COURSES);
  const set = new Set((ids||[]).map(x => String(x).trim().toUpperCase()));
  return rows
    .filter(r => set.has(String(r.course_id||'').trim().toUpperCase()))
    .map(r => ({
      course_id: r.course_id,
      title: r.title,
      program_scope: r.program_scope,
      status: r.status,
      page_slug: r.page_slug || '' // helpful for dashboards
    }));
}

// Legacy: not used in new verify, but kept for reference
function _getEffectiveEnrollments_(user_id){
  const {rows} = _rows(SH_ENR);
  const now = _now();
  const out = [];

  rows.forEach(r => {
    if (String(r.user_id||'').trim().toLowerCase() !== String(user_id||'').trim().toLowerCase()) return;

    const active = _toBool_(r.active);
    if (!active) return;

    const exp = _parseUtc_(r.expires_utc);
    if (exp && now >= exp) return;

    const cid = String(r.course_id||'').trim().toUpperCase();
    if (!cid) return;
    out.push(cid);
  });

  return out;
}

/* ========= Products & Subscriptions (access model) ========= */

/**
 * Get all ACTIVE, unexpired subscriptions for a given user.
 */
function _getActiveSubscriptionsForUser(user_id){
  const {rows} = _rows(SH_SUBSCRIPTIONS);
  const now = _now();
  const uid = String(user_id||'').trim();

  return rows.filter(r => {
    if (String(r.user_id||'').trim() !== uid) return false;

    const status = String(r.status||'').trim().toUpperCase();
    if (status !== 'ACTIVE') return false;

    const start = _parseUtc_(r.start_utc);
    if (start && now < start) return false;

    const exp = _parseUtc_(r.expires_utc);
    if (exp && now >= exp) return false;

    return true;
  });
}

/**
 * From a list of subscriptions, compute:
 * - merged course_ids from products.courses_included
 * - latest expiry across all subscriptions
 */
function _getAccessFromSubscriptions(subs){
  const {rows: productRows} = _rows(SH_PRODUCTS);

  // Index products by product_id (uppercased)
  const productsById = {};
  productRows.forEach(p => {
    const pid = String(p.product_id||'').trim().toUpperCase();
    if (pid) productsById[pid] = p;
  });

  const courseSet = new Set();
  let latestExp = null;

  subs.forEach(sub => {
    const pid = String(sub.product_id||'').trim().toUpperCase();
    const product = productsById[pid];

    if (product && product.courses_included) {
      const ids = _parseCoursesIncluded_(product.courses_included);
      ids.forEach(function(cid){ courseSet.add(cid); });
    }

    const exp = _parseUtc_(sub.expires_utc);
    if (exp && (!latestExp || exp > latestExp)) {
      latestExp = exp;
    }
  });

  return {
    courses: Array.from(courseSet).sort(),
    expires_utc: latestExp ? _iso(latestExp) : ''
  };
}

/**
 * Scan subscriptions and send "expiring soon" emails.
 *
 * daysArray: array of integers (e.g. [3,1]) representing days-left thresholds.
 * Returns a stats object (not JSON).
 */
function _runExpiryReminderScan_(daysArray) {
  var daysList = Array.isArray(daysArray) && daysArray.length ? daysArray : [3, 1];
  var msPerDay = 24 * 60 * 60 * 1000;
  var now      = _now();
  var nowTime  = now.getTime();

  var subsData     = _rows(SH_SUBSCRIPTIONS);
  var shSubs       = subsData.sh;
  var headersSubs  = subsData.headers || [];
  var subsRows     = subsData.rows || [];

  // Build user and product maps for fast lookup
  var userData     = _rows(SH_USERS);
  var usersById    = {};
  (userData.rows || []).forEach(function(u) {
    if (u.user_id) {
      usersById[String(u.user_id).trim()] = u;
    }
  });

  var productData  = _rows(SH_PRODUCTS);
  var productsById = {};
  (productData.rows || []).forEach(function(p) {
    var pid = String(p.product_id || '').trim().toUpperCase();
    if (pid) {
      productsById[pid] = p;
    }
  });

  var scanned   = 0;
  var sent      = 0;
  var sentByDay = { };

  // Helper to update expiry_reminded field on a subscription row
  function _updateExpiryRemindedForRow_(rowIndex, rowObj, newFlag) {
    rowObj.expiry_reminded = newFlag;
    _updateObj(shSubs, headersSubs, rowIndex, rowObj);
  }

  for (var i = 0; i < subsRows.length; i++) {
    var r = subsRows[i];
    scanned++;

    var uid = String(r.user_id || '').trim();
    if (!uid) continue;

    var user = usersById[uid];
    if (!user) continue;
    if (!_toBool_(user.active)) continue;

    var status = String(r.status || '').trim().toUpperCase();
    if (status !== 'ACTIVE') continue;

    var exp = _parseUtc_(r.expires_utc);
    if (!exp) continue;

    // Skip already expired
    if (exp.getTime() <= nowTime) continue;

    // Optional: skip future-start subscriptions (not yet started)
    var start = _parseUtc_(r.start_utc);
    if (start && start.getTime() > nowTime) continue;

    // Days left until expiry (rounded down)
    var diffMs   = exp.getTime() - nowTime;
    var daysLeft = Math.floor(diffMs / msPerDay);

    if (daysList.indexOf(daysLeft) === -1) {
      continue; // not one of the thresholds we care about
    }

    var productId = String(r.product_id || '').trim().toUpperCase();
    var product   = productsById[productId] || null;

    var remRaw = String(r.expiry_reminded || '').trim().toLowerCase();
    var shouldSend = false;
    var newFlag    = remRaw;

    if (daysLeft === 3) {
      // Only send if not already reminded for 3 days
      if (remRaw !== '3' && remRaw !== 'both') {
        shouldSend = true;
        if (remRaw === '1') {
          newFlag = 'both';
        } else {
          newFlag = '3';
        }
      }
    } else if (daysLeft === 1) {
      // Only send if not already reminded for 1 day
      if (remRaw !== '1' && remRaw !== 'both') {
        shouldSend = true;
        if (remRaw === '3') {
          newFlag = 'both';
        } else {
          newFlag = '1';
        }
      }
    }

    if (!shouldSend) continue;

    try {
      // Build a subscription-like object for the email helper
      var subObj = {
        subscription_id: r.subscription_id || '',
        user_id:         uid,
        product_id:      productId,
        start_utc:       r.start_utc || '',
        expires_utc:     r.expires_utc || '',
        status:          r.status || ''
      };

      _sendSubscriptionExpiringEmail_(user, product, subObj, daysLeft);

      sent++;
      var key = String(daysLeft);
      sentByDay[key] = (sentByDay[key] || 0) + 1;

      // Update expiry_reminded in the sheet
      var rowIndex = i + 2; // data starts at row 2
      _updateExpiryRemindedForRow_(rowIndex, r, newFlag);

    } catch (e) {
      Logger.log('Error sending expiry reminder for subscription ' + (r.subscription_id || '') + ': ' + e);
    }
  }

  return {
    scanned: scanned,
    sent:    sent,
    sentByDay: sentByDay
  };
}

/**
 * Core expiry-reminder runner used by both the admin API and the time-driven trigger.
 * Returns the stats object from _runExpiryReminderScan_([3, 1]).
 */
function _runExpiryRemindersCore_() {
  // Default thresholds: 3 days and 1 day before expiry
  return _runExpiryReminderScan_([3, 1]);
}

/**
 * Ensure the user has a default TRIAL subscription (WELCOME_TRIAL),
 * unless they already have an ACTIVE PAID/FREE product.
 *
 * NOTE: Legacy support removed. System expects only WELCOME_TRIAL.
 */
function _ensureDefaultTrialSubscriptionForUser_(user_id, defaultTrialProductId){
  var CANON_TRIAL_ID = 'WELCOME_TRIAL';

  // Canonicalize input (default → WELCOME_TRIAL)
  var trialId = String(defaultTrialProductId || CANON_TRIAL_ID).trim().toUpperCase();
  if (!user_id || !trialId) return;

  var uid = String(user_id || '').trim();
  if (!uid) return;

  // 1) Load active subscriptions for this user
  var activeSubs = _getActiveSubscriptionsForUser(uid);

  // 2) Load products and index by product_id (UPPER)
  var prodData = _rows(SH_PRODUCTS);
  var productRows = prodData.rows || [];
  var productsById = {};
  productRows.forEach(function(p){
    var pid = String(p.product_id || '').trim().toUpperCase();
    if (pid) productsById[pid] = p;
  });

  // Helper to read kind safely
  function _getKindForProductId(pid){
    var p = productsById[String(pid || '').trim().toUpperCase()];
    if (!p) return '';
    return String(p.kind || '').trim().toUpperCase();
  }

  // 3) If any ACTIVE PAID or FREE → do nothing
  var hasPaidOrFree = activeSubs.some(function(sub){
    var pid  = String(sub.product_id || '').trim().toUpperCase();
    var kind = _getKindForProductId(pid);
    return (kind === 'PAID' || kind === 'FREE');
  });
  if (hasPaidOrFree) return;

  // 4) If any ACTIVE TRIAL already → do nothing
  var hasTrial = activeSubs.some(function(sub){
    var pid  = String(sub.product_id || '').trim().toUpperCase();
    var kind = _getKindForProductId(pid);
    return (kind === 'TRIAL');
  });
  if (hasTrial) return;

  // 5) Look up the default trial product (canonical)
  var trialProduct = productsById[trialId];
  if (!trialProduct) {
    Logger.log('Default trial product not found: ' + trialId);
    return;
  }

  var status = String(trialProduct.status || '').trim().toUpperCase();
  if (status && status !== 'ACTIVE') {
    Logger.log('Default trial product is not ACTIVE: ' + trialId);
    return;
  }

  var duration = parseInt(trialProduct.duration_days, 10);
  if (!duration || duration <= 0) {
    Logger.log('Default trial product has invalid duration_days: ' + trialId);
    return;
  }

  // 6) Create a new subscription row for the trial
  var start   = _now();
  var expires = _addDays(start, duration);

  var shSubs     = _sh(SH_SUBSCRIPTIONS);
  var subHeaders = _headers(shSubs);
  var subscription_id = 'S_' + Utilities.getUuid().replace(/-/g,'').slice(0,10);

  var subObj = {
    subscription_id: subscription_id,
    user_id:         uid,
    product_id:      trialId,
    start_utc:       _iso(start),
    expires_utc:     _iso(expires),
    status:          'ACTIVE'
  };

  _appendObj(shSubs, subHeaders, subObj);
  Logger.log('Assigned default trial subscription ' + trialId + ' to user ' + uid);
}


/**
 * Compute allowed Telegram group keys for a user based on ACTIVE subscriptions.
 * Reads products.telegram_group_keys and unions keys for the user's active product_ids.
 *
 * Returns: ["RN_2026", "PREMIUM_2026", ...] (uppercase, deduped)
 */
function _getAllowedTelegramGroupKeysForUser_(user_id) {
  try {
    user_id = String(user_id || "").trim();
    if (!user_id) return [];

    // 1) Active subscriptions -> product_ids
    var subs = _getActiveSubscriptionsForUser(user_id) || [];
    var productIds = [];
    var seenPid = {};

    subs.forEach(function (s) {
      var pid = String(s.product_id || "").trim().toUpperCase();
      if (!pid || seenPid[pid]) return;
      seenPid[pid] = true;
      productIds.push(pid);
    });

    if (!productIds.length) return [];

    // 2) Build product_id -> telegram_group_keys CSV map
    var productToKeys = {};
    try {
      var pr = _rows(SH_PRODUCTS);
      (pr.rows || []).forEach(function (p) {
        var pid = String(p.product_id || "").trim().toUpperCase();
        if (!pid) return;
        // Column name must be exactly telegram_group_keys in products tab
        productToKeys[pid] = String(p.telegram_group_keys || "").trim();
      });
    } catch (_) {
      // If products read fails, return empty safely
      return [];
    }

    // 3) Union keys across active products
    var keySet = {};
    productIds.forEach(function (pid) {
      var csv = String(productToKeys[pid] || "").trim();
      if (!csv) return;
      csv.split(",").forEach(function (k) {
        var kk = String(k || "").trim().toUpperCase();
        if (kk) keySet[kk] = true;
      });
    });

    return Object.keys(keySet).sort(); // stable order
  } catch (err) {
    // Hard-fail safe: return empty
    return [];
  }
}
