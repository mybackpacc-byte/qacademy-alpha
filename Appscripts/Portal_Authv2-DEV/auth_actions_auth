/** ============================================================
 * QAcademy Portal — Auth Actions (Public)
 * doGet/doPost router + public API endpoints:
 * login, verify, self-register, logout,
 * password reset flows, Google Sign-In.
 * Each API returns JSON and calls core_domain helpers.
 * No sheet utilities or heavy logic here.
 * ============================================================ */


/* ========= auth_actions_auth.gs ========= */


/* ========= Public endpoints ========= */
function doGet(e){
  const a = (e && e.parameter && e.parameter.action || '').toLowerCase();

  if (a === 'verify') {
return apiVerify({ token: (e.parameter.token || ''), include: (e.parameter.include || '') });
  }

  // Health/status with BUILD marker so you can confirm deployments
  return _json({ ok:true, service:'QAcademyAuth', build:BUILD, now:_iso(_now()) });
}


/**
 * SINGLE ROUTER — AUTH + ADMIN actions only.
 * Accepts application/x-www-form-urlencoded and (optionally) JSON bodies.
 */
function doPost(e){
  try{
    var p = (e && e.parameter) || {};
    var body = {};
    try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch(_){ body = {}; }

    // Prefer form fields; fallback to JSON
    var action     = (p.action     || body.action     || '').trim();
    var username   = (p.username   || body.username   || '').trim(); // legacy login username
    var email      = (p.email      || body.email      || '').trim(); // NEW (login + assign_product target_email)
    var password   = (p.password   || body.password   || '');
    var token      = (p.token      || body.token      || '');
    var include    = (p.include    || body.include    || '').trim();
    var note       = (p.note       || body.note       || '');
    var ua         = (p.ua         || body.ua         || '');
    var ip         = (p.ip         || body.ip         || '');
    // Google ID token for Google Sign-In
    var id_token   = (p.id_token   || body.id_token   || '');
    // Admin create-user fields
    var forename   = (p.forename   || body.forename   || '').trim();
    var surname    = (p.surname    || body.surname    || '').trim();
    var phone_number = (p.phone_number || body.phone_number || '').trim();
    var program_id = (p.program_id || body.program_id || '').trim();
    var cohort     = (p.cohort     || body.cohort     || '').trim();
    var role       = (p.role       || body.role       || '').trim();
    var new_username = (p.new_username || body.new_username || '').trim();
    var avatar_url   = (p.avatar_url   || body.avatar_url   || '').trim();
    var reg_username = (p.reg_username || body.reg_username || p.username || body.username || p.new_username || body.new_username || '').trim().toLowerCase();
    var active_str   = (p.active       || body.active       || '').trim();
    var must_change_str = (p.must_change_password || body.must_change_password || '').trim();
    // Admin assign-product fields
    var user_id_param    = (p.user_id    || body.user_id    || '').trim();
    var product_id_param = (p.product_id || body.product_id || '').trim();
    var start_utc_param  = (p.start_utc  || body.start_utc  || '').trim();
    // Admin token-audit filters
    var filter_user_id  = (p.filter_user_id  || body.filter_user_id  || '').trim();
    var filter_email    = (p.filter_email    || body.filter_email    || '').trim();
    var active_only_str = (p.active_only     || body.active_only     || '').trim();
    var limit_str       = (p.limit           || body.limit           || '').trim();
    var target_token   = (p.target_token   || body.target_token   || '').trim();
    // Admin search / subscriptions
    var query_str      = (p.query          || body.query          || '').trim();
    var target_user_id = (p.target_user_id || body.target_user_id || '').trim();
    //password reset
    var request_id  = (p.request_id  || body.request_id  || '').trim();
    var reset_token = (p.reset_token || body.reset_token || '').trim();
    var new_password = (p.new_password || body.new_password || '');

    // --- Messaging fields ---
    var thread_id     = (p.thread_id     || body.thread_id     || '').trim();
    var context_type  = (p.context_type  || body.context_type  || '').trim();
    var course_id     = (p.course_id     || body.course_id     || '').trim();
    var quiz_id       = (p.quiz_id       || body.quiz_id       || '').trim();
    var attempt_id    = (p.attempt_id    || body.attempt_id    || '').trim();
    var question_id   = (p.question_id   || body.question_id   || '').trim();
    var body_text     = (p.body_text     || body.body_text     || '');
    var subject       = (p.subject       || body.subject       || '').trim();

    // Bulk scope arrays (support JSON arrays OR comma-separated strings)
    var program_ids        = (p.program_ids        || body.program_ids        || []);
    var course_ids         = (p.course_ids         || body.course_ids         || []);
    var product_ids        = (p.product_ids        || body.product_ids        || []);
    var subscription_kinds = (p.subscription_kinds || body.subscription_kinds || []);
    var cohort_ids         = (p.cohort_ids         || body.cohort_ids         || []);
    var level_ids          = (p.level_ids          || body.level_ids          || []);
    var user_ids           = (p.user_ids           || body.user_ids           || []);
   


    if(!action) return _json({ok:false, error:'missing_action'});

    // ----- AUTH actions -----
    if(action==='login')         return apiLogin({username, password, ua, ip});   // legacy (username-based)
    if(action==='login_email')   return apiLoginEmail({email, password, ua, ip}); // email-based backup
    if(action==='login_google')  return apiLoginGoogle({id_token, ua, ip});       // Google Sign-In
    if(action==='verify')        return apiVerify({ token, include });
    if(action==='logout')        return apiLogout({token});

    // ----- password reset actions -----
    if(action==='reset_request') return apiResetRequest({
      identifier: email || username,  // allow either email or username
      ua,
      ip,
      note
    });

    // NEW: reset link validation + apply
    if(action === 'reset_check') {
      return apiResetCheck({
        request_id,
        reset_token,
        ua,
        ip
      });
    }

    if(action === 'reset_apply') {
      return apiResetApply({
        request_id,
        reset_token,
        new_password,
        ua,
        ip
      });
    }

    // ----- Self register actions -----
if(action==='self_register') return apiSelfRegister({
  forename,
  surname,
  email,
  password,
  phone_number,
  program_id,
  cohort,
  avatar_url,
  ua,
  ip,
  username: reg_username
});

// NEW: Paid self-onboarding (creates user but DOES NOT assign trial)
if(action==='self_register_paid') return apiSelfRegisterPaid({
  forename,
  surname,
  email,
  password,
  phone_number,
  program_id,
  cohort,
  avatar_url,
  ua,
  ip,
  username: reg_username,
  product_id: (p.product_id || body.product_id || '').trim()
});

// TA-only self onboarding (creates user, NO subscriptions)
if(action==='self_register_ta') return apiSelfRegisterTA({
  forename,
  surname,
  email,
  password,
  phone_number,
  program_id,
  cohort,
  avatar_url,
  ua,
  ip,
  username: reg_username
});

// ----- Payments activation (server-to-server) -----
if(action==='payments_activate') return apiPaymentsActivate({
  secret:     (p.secret     || body.secret     || '').trim(),
  user_id:    (p.user_id    || body.user_id    || '').trim(),
  email:      (p.email      || body.email      || '').trim(),
  product_id: (p.product_id || body.product_id || '').trim(),
  source:     (p.source     || body.source     || '').trim(),
  source_ref: (p.source_ref || body.source_ref || '').trim()
});

// ----- Telegram entitlements (server-to-server) -----
if(action==='tg.entitlements.by_user_key') return apiTgEntitlementsByUserKey({
  secret:      (p.secret      || body.secret      || '').trim(),
  user_id:     (p.user_id     || body.user_id     || '').trim(),
  qa_user_key: (p.qa_user_key || body.qa_user_key || '').trim()
});


if(action==='reset_password') return apiResetPassword({ token, password });


    // ----- ADMIN actions -----
    if(action==='create_user')   return apiCreateUser({
      token,
      forename,
      surname,
      email,
      phone_number,
      program_id,
      cohort,
      role,
      username: new_username,
      avatar_url: avatar_url,
      active: active_str,
      must_change_password: must_change_str
    });

    if(action==='list_products') return apiListProducts({ token });

    if(action==='assign_product') return apiAssignProduct({
      token,
      user_id:      user_id_param,
      target_email: email,           // using "email" field as target_email
      product_id:   product_id_param,
      start_utc:    start_utc_param
    });

    if(action==='list_tokens') return apiListTokens({
      token,
      filter_user_id,
      filter_email,
      active_only: active_only_str,
      limit:       limit_str
    }); 

    if(action==='admin_revoke_token') return apiAdminRevokeToken({
      token,
      target_token
    });

    if(action==='list_programs') return apiListPrograms({ token });

    if(action==='admin_search_users') return apiAdminSearchUsers({
      token,
      query: query_str,
      limit: limit_str
    });

    if(action==='admin_get_user_subscriptions') return apiAdminGetUserSubscriptions({
      token,
      user_id: user_id_param || target_user_id,
      email
    });

    if(action==='send_expiry_reminders') return apiSendExpiryReminders({ token });

    // --- NEW: Admin auth audit endpoints ---
    if (action === 'admin_list_auth_events') return apiAdminListAuthEvents({
      token,
      filter_user_id,
      filter_email,
      kind:      (p.kind       || body.kind       || '').trim(),
      only_failed: (p.only_failed || body.only_failed || '').trim(),
      since_utc: (p.since_utc  || body.since_utc  || '').trim(),
      until_utc: (p.until_utc  || body.until_utc  || '').trim(),
      limit:     limit_str
    });

    if (action === 'admin_list_reset_requests') return apiAdminListResetRequests({
      token,
      filter_identifier: (p.filter_identifier || body.filter_identifier || '').trim(),
      filter_email,
      status:    (p.status    || body.status    || '').trim(),
      since_utc: (p.since_utc || body.since_utc || '').trim(),
      until_utc: (p.until_utc || body.until_utc || '').trim(),
      limit:     limit_str
    });

    // No quiz actions here anymore
    return _json({ok:false, error:'unknown_action'});
  }catch(err){
    return _json({ok:false, error:String(err.stack||err)});
  }
}



/* ========= Actions (AUTH) ========= */

/**
 * Legacy username-based login.
 * New pages should call login_email or login_google.
 */
function apiLogin({username, password, ua='', ip=''}) {
  // 1) Basic validation first
  if(!username || !password) {
    _logAuthEvent_({
      kind:       'LOGIN_USERNAME',
      identifier: username,
      user_id:    '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: 'missing_credentials',
      note:       ''
    });
    return _json({ok:false, error:'missing_credentials'});
  }

  // 2) Look up user (may be null) so we can derive user_id for RL
  const user = _getUserByUsername(username); // may be undefined

  // 3) Rate limit pre-check (prefers user_id if we know it)
  var rl = _checkLoginRateLimit_({
    identifier: username,
    user_id:    user ? (user.user_id || '') : '',
    ip:         ip,
    kind:       'LOGIN_USERNAME'
  });

  if (rl.blocked) {
    var rlError = (rl.reason === 'too_many_attempts_24h')
      ? 'too_many_attempts_24h'
      : 'too_many_attempts';

    _logAuthEvent_({
      kind:       'LOGIN_USERNAME',
      identifier: username,
      user_id:    user ? (user.user_id || '') : '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: rlError,
      note:       'blocked(' + (rl.window || '') + '): ' +
                  'short_user='       + (rl.short_user       || 0) +
                  ', short_identifier=' + (rl.short_identifier || 0) +
                  ', short_ip='       + (rl.short_ip         || 0) +
                  ', long_user='      + (rl.long_user        || 0) +
                  ', long_identifier='+ (rl.long_identifier   || 0) +
                  ', long_ip='        + (rl.long_ip          || 0)
    });

    return _json({ok:false, error: rlError});
  }

  // 4) Normal login logic (unchanged, but reuses user)
  if(!user) {
    _logAuthEvent_({
      kind:       'LOGIN_USERNAME',
      identifier: username,
      user_id:    '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: 'invalid_login',
      note:       'no_user'
    });
    return _json({ok:false, error:'invalid_login'});
  }

  if(!_toBool_(user.active)) {
    _logAuthEvent_({
      kind:       'LOGIN_USERNAME',
      identifier: username,
      user_id:    user.user_id || '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: 'user_inactive',
      note:       ''
    });
    return _json({ok:false, error:'user_inactive'});
  }

  const uExp = _parseUtc_(user.expires_utc);
  if(uExp && _now() >= uExp) {
    _logAuthEvent_({
      kind:       'LOGIN_USERNAME',
      identifier: username,
      user_id:    user.user_id || '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: 'user_expired',
      note:       ''
    });
    return _json({ok:false, error:'user_expired'});
  }

  if(!_verifyPassword(user, password)) {
    _logAuthEvent_({
      kind:       'LOGIN_USERNAME',
      identifier: username,
      user_id:    user.user_id || '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: 'invalid_login',
      note:       'bad_password'
    });
    return _json({ok:false, error:'invalid_login'});
  }

  // 5) Success path
  _enforceTokenLimitForUser(user.user_id, 2);

  const uaHash      = ua ? _hashWebSafeSHA256(ua) : '';
  const ipHash      = ip ? _hashWebSafeSHA256(ip) : '';
  const deviceLabel = _deriveDeviceLabelFromUA_(ua);
  const t = _issueToken(user.user_id, uaHash, ipHash, deviceLabel, 'USERNAME');
  const token = t.token;
  const token_expires_utc = t.expires_utc;

  const {headers, sh} = _rows(SH_USERS);
  const idx = _getUserRowIndex(username);
  if(idx>0){
    const row = sh.getRange(idx,1,1,headers.length).getValues()[0];
    const obj = _rowToObj(headers,row);
    obj.last_login_utc = _iso(_now());
    _updateObj(sh, headers, idx, obj);
  }

  const profile = {
    user_id:   user.user_id,
    username:  user.username,
    name:      user.name,
    forename:  user.forename || '',
    surname:   user.surname  || '',
    email:     user.email,
    phone_number: user.phone_number || '',
    program_id: user.program_id,
    cohort:     user.cohort,
    avatar_url: user.avatar_url || '',
    must_change_password: _toBool_(user.must_change_password),
    role:      user.role || '',
    expires_utc: user.expires_utc || ''
  };

  _logAuthEvent_({
    kind:       'LOGIN_USERNAME',
    identifier: username,
    user_id:    user.user_id || '',
    ip:         ip,
    ua:         ua,
    ok:         true,
    error_code: 'ok',
    note:       ''
  });

  return _json({ok:true, token, token_expires_utc, profile, login_via:'username'});
}


/**
 * Email-based login (backup to Google).
 */
function apiLoginEmail({email, password, ua='', ip=''}) {
  // 1) Basic validation
  if (!email || !password) {
    _logAuthEvent_({
      kind:       'LOGIN_EMAIL',
      identifier: email,
      user_id:    '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: 'missing_credentials',
      note:       ''
    });
    return _json({ok:false, error:'missing_credentials'});
  }

  // 2) Look up user first so we know user_id
  const user = _getUserByEmail(email);

  // 3) Rate-limit using user_id (if found) + identifier + IP
  var rl = _checkLoginRateLimit_({
    identifier: email,
    user_id:    user ? (user.user_id || '') : '',
    ip:         ip,
    kind:       'LOGIN_EMAIL'
  });

  if (rl.blocked) {
    var rlError = (rl.reason === 'too_many_attempts_24h')
      ? 'too_many_attempts_24h'
      : 'too_many_attempts';

    _logAuthEvent_({
      kind:       'LOGIN_EMAIL',
      identifier: email,
      user_id:    user ? (user.user_id || '') : '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: rlError,
      note:       'blocked(' + (rl.window || '') + '): ' +
                  'short_user='       + (rl.short_user       || 0) +
                  ', short_identifier=' + (rl.short_identifier || 0) +
                  ', short_ip='       + (rl.short_ip         || 0) +
                  ', long_user='      + (rl.long_user        || 0) +
                  ', long_identifier='+ (rl.long_identifier   || 0) +
                  ', long_ip='        + (rl.long_ip          || 0)
    });

    return _json({ok:false, error: rlError});
  }

  // 4) Normal login logic
  if (!user) {
    _logAuthEvent_({
      kind:       'LOGIN_EMAIL',
      identifier: email,
      user_id:    '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: 'invalid_login',
      note:       'no_user'
    });
    return _json({ok:false, error:'invalid_login'});
  }

  if (!_toBool_(user.active)) {
    _logAuthEvent_({
      kind:       'LOGIN_EMAIL',
      identifier: email,
      user_id:    user.user_id || '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: 'user_inactive',
      note:       ''
    });
    return _json({ok:false, error:'user_inactive'});
  }

  const uExp = _parseUtc_(user.expires_utc);
  if (uExp && _now() >= uExp) {
    _logAuthEvent_({
      kind:       'LOGIN_EMAIL',
      identifier: email,
      user_id:    user.user_id || '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: 'user_expired',
      note:       ''
    });
    return _json({ok:false, error:'user_expired'});
  }

  if (!_verifyPassword(user, password)) {
    _logAuthEvent_({
      kind:       'LOGIN_EMAIL',
      identifier: email,
      user_id:    user.user_id || '',
      ip:         ip,
      ua:         ua,
      ok:         false,
      error_code: 'invalid_login',
      note:       'bad_password'
    });
    return _json({ok:false, error:'invalid_login'});
  }

  // 5) Success path
  _enforceTokenLimitForUser(user.user_id, 2);

  const uaHash      = ua ? _hashWebSafeSHA256(ua) : '';
  const ipHash      = ip ? _hashWebSafeSHA256(ip) : '';
  const deviceLabel = _deriveDeviceLabelFromUA_(ua);
  const t = _issueToken(user.user_id, uaHash, ipHash, deviceLabel, 'EMAIL');
  const token = t.token;
  const token_expires_utc = t.expires_utc;

  const {headers, sh} = _rows(SH_USERS);
  const idx = _findRowIndexBy(sh, 'email', email);
  if (idx > 0) {
    const row = sh.getRange(idx,1,1,headers.length).getValues()[0];
    const obj = _rowToObj(headers,row);
    obj.last_login_utc = _iso(_now());
    _updateObj(sh, headers, idx, obj);
  }

  const profile = {
    user_id:   user.user_id,
    username:  user.username,
    name:      user.name || [user.forename, user.surname].filter(Boolean).join(' '),
    forename:  user.forename || '',
    surname:   user.surname  || '',
    email:     user.email,
    phone_number: user.phone_number || '',
    program_id: user.program_id,
    cohort:     user.cohort,
    avatar_url: user.avatar_url || '',
    must_change_password: _toBool_(user.must_change_password),
    role:      user.role || '',
    expires_utc: user.expires_utc || ''
  };

  _logAuthEvent_({
    kind:       'LOGIN_EMAIL',
    identifier: email,
    user_id:    user.user_id || '',
    ip:         ip,
    ua:         ua,
    ok:         true,
    error_code: 'ok',
    note:       ''
  });

  return _json({ok:true, token, token_expires_utc, profile, login_via:'email'});
}



/**
 * Google Sign-In login.
 * Frontend calls action=login_google with id_token (from Google).
 */
function apiLoginGoogle({id_token, ua='', ip=''}) {
  if (!id_token) return _json({ok:false, error:'missing_id_token'});

  var payload;
  try {
    payload = _verifyGoogleIdToken_(id_token);
  } catch (err) {
    // Failed Google token → count as failed login, but no user yet
    try {
      _logAuthEvent_({
        kind:       'LOGIN_GOOGLE',
        identifier: '',
        user_id:    '',
        ip:         ip,
        ua:         ua,
        ok:         false,
        error_code: 'google_token_invalid',
        note:       String(err && err.message || err || 'google_token_invalid')
      });
    } catch (_) {}
    return _json({ok:false, error:String(err.message || err)});
  }

  var email = String(payload.email || '').trim().toLowerCase();
  if (!email) {
    return _json({ok:false, error:'google_no_email'});
  }

  // Look up user by email first so we can use user_id for RL
  const user = _getUserByEmail(email);

  // Rate-limit using user_id (if known) + identifier + IP
  var rl = _checkLoginRateLimit_({
    identifier: email,
    user_id:    user ? (user.user_id || '') : '',
    ip:         ip,
    kind:       'LOGIN_GOOGLE'
  });

  if (rl.blocked) {
    var rlError = (rl.reason === 'too_many_attempts_24h')
      ? 'too_many_attempts_24h'
      : 'too_many_attempts';

    try {
      _logAuthEvent_({
        kind:       'LOGIN_GOOGLE',
        identifier: email,
        user_id:    user ? (user.user_id || '') : '',
        ip:         ip,
        ua:         ua,
        ok:         false,
        error_code: rlError,
        note:       'blocked(' + (rl.window || '') + '): ' +
                    'short_user='       + (rl.short_user       || 0) +
                    ', short_identifier=' + (rl.short_identifier || 0) +
                    ', short_ip='       + (rl.short_ip         || 0) +
                    ', long_user='      + (rl.long_user        || 0) +
                    ', long_identifier='+ (rl.long_identifier   || 0) +
                    ', long_ip='        + (rl.long_ip          || 0)
      });
    } catch (_) {}

    return _json({ ok:false, error: rlError });
  }

  if (!user) {
    // No account for this email → failed login
    try {
      _logAuthEvent_({
        kind:       'LOGIN_GOOGLE',
        identifier: email,
        user_id:    '',
        ip:         ip,
        ua:         ua,
        ok:         false,
        error_code: 'no_account_for_email',
        note:       ''
      });
    } catch (_) {}
    return _json({ok:false, error:'no_account_for_email'});
  }

  if (!_toBool_(user.active)) {
    try {
      _logAuthEvent_({
        kind:       'LOGIN_GOOGLE',
        identifier: email,
        user_id:    user.user_id || '',
        ip:         ip,
        ua:         ua,
        ok:         false,
        error_code: 'user_inactive',
        note:       ''
      });
    } catch (_) {}
    return _json({ok:false, error:'user_inactive'});
  }

  const uExp = _parseUtc_(user.expires_utc);
  if (uExp && _now() >= uExp) {
    try {
      _logAuthEvent_({
        kind:       'LOGIN_GOOGLE',
        identifier: email,
        user_id:    user.user_id || '',
        ip:         ip,
        ua:         ua,
        ok:         false,
        error_code: 'user_expired',
        note:       ''
      });
    } catch (_) {}
    return _json({ok:false, error:'user_expired'});
  }

  // Success path
  _enforceTokenLimitForUser(user.user_id, 2);

  const uaHash      = ua ? _hashWebSafeSHA256(ua) : '';
  const ipHash      = ip ? _hashWebSafeSHA256(ip) : '';
  const deviceLabel = _deriveDeviceLabelFromUA_(ua);
  const t = _issueToken(user.user_id, uaHash, ipHash, deviceLabel, 'GOOGLE');
  const token = t.token;
  const token_expires_utc = t.expires_utc;

  try {
    _logAuthEvent_({
      kind:       'LOGIN_GOOGLE',
      identifier: email,
      user_id:    user.user_id || '',
      ip:         ip,
      ua:         ua,
      ok:         true,
      error_code: 'ok',
      note:       ''
    });
  } catch (_) {}

  const {headers, sh} = _rows(SH_USERS);
  const idx = _findRowIndexBy(sh, 'email', email);
  if (idx > 0) {
    const row = sh.getRange(idx,1,1,headers.length).getValues()[0];
    const obj = _rowToObj(headers,row);
    obj.last_login_utc = _iso(_now());
    _updateObj(sh, headers, idx, obj);
  }

  const profile = {
    user_id:   user.user_id,
    username:  user.username,
    name:      user.name || [user.forename, user.surname].filter(Boolean).join(' '),
    forename:  user.forename || '',
    surname:   user.surname  || '',
    email:     user.email,
    phone_number: user.phone_number || '',
    program_id: user.program_id,
    cohort:     user.cohort,
    avatar_url: user.avatar_url || '',
    must_change_password: _toBool_(user.must_change_password),
    role:      user.role || '',
    expires_utc: user.expires_utc || ''
  };

  return _json({ok:true, token, token_expires_utc, profile, login_via:'google'});
}





/**
 * Verify token → user → subscriptions → access.
 *
 * Optional:
 *  - include=subscriptions  → adds `subscriptions[]` (safe subset) to response
 *
 * Notes:
 *  - We DO NOT expose source/source_ref (Paystack refs) to the client.
 *  - We MERGE duplicates by product_id (keeping the latest expires_utc) to avoid messy UI.
 */
function apiVerify(args){
  const token   = (args && args.token) ? String(args.token).trim() : '';
  const include = (args && args.include) ? String(args.include).trim().toLowerCase() : '';

  if(!token) return _json({ok:false, error:'missing_token'});

  const chk = _checkToken(token);
  if(!chk.ok) return _json({ok:false, error:chk.reason});

  const u = _getUserById(chk.token.user_id);
  if(!u) return _json({ok:false, error:'user_missing'});
  if(!_toBool_(u.active)) return _json({ok:false, error:'user_inactive'});

  const uExp = _parseUtc_(u.expires_utc);
  if(uExp && _now() >= uExp) return _json({ok:false, error:'user_expired'});

  // Active, unexpired subscriptions
  const subs   = _getActiveSubscriptionsForUser(u.user_id);
  const access = _getAccessFromSubscriptions(subs);

  // User payload (ADD level)
  const userOut = {
    user_id:   u.user_id,
    username:  u.username,
    name:      u.name || [u.forename, u.surname].filter(Boolean).join(' '),
    forename:  u.forename || '',
    surname:   u.surname  || '',
    email:     u.email,
    phone_number: u.phone_number || '',
    program_id: u.program_id,
    cohort:     u.cohort,
    avatar_url: u.avatar_url || '',
    role:       u.role || '',
    level:      u.level || '',              // ✅ NEW
    must_change_password: _toBool_(u.must_change_password),
    expires_utc: u.expires_utc || ''
  };

  const flags = {
    is_admin: String(u.role||'').trim().toUpperCase() === 'ADMIN'
  };

  const courseMeta = access.courses.length ? _getCoursesByIds(access.courses) : [];

  // Optional: include subscriptions (safe subset only)
  let subsOut = undefined;
  if(include.indexOf('subscriptions') !== -1){
    const now = _now();
    const nowT = now.getTime();

    // Build product_id -> product_name map (best-effort; falls back to product_id)
    const productsById = {};
    try{
      const pr = _rows(SH_PRODUCTS);
      (pr.rows || []).forEach(p => {
        const pid = String(p.product_id||'').trim().toUpperCase();
        if(!pid) return;
        const nm = String(p.name || p.product_name || p.plan_name || '').trim();
        productsById[pid] = nm || pid;
      });
    } catch(_){
      // If products table read fails, we still return product_id safely.
    }

    // Merge duplicates by product_id: keep the row with the latest expires_utc
    const bestByProduct = {};
    subs.forEach(s => {
      const pid = String(s.product_id||'').trim().toUpperCase();
      if(!pid) return;

      const exp = _parseUtc_(s.expires_utc);
      const cur = bestByProduct[pid];

      if(!cur){
        bestByProduct[pid] = s;
        return;
      }

      const curExp = _parseUtc_(cur.expires_utc);
      // Keep whichever expires later (defensive if any exp is missing)
      if(exp && (!curExp || exp.getTime() > curExp.getTime())){
        bestByProduct[pid] = s;
      }
    });

    // Convert to safe output + sort by expiry desc
    subsOut = Object.keys(bestByProduct).map(pid => {
      const s = bestByProduct[pid];
      const exp = _parseUtc_(s.expires_utc);
      const daysLeft = exp ? Math.max(0, Math.ceil((exp.getTime() - nowT) / 86400000)) : '';

      return {
        subscription_id: String(s.subscription_id||'').trim(),      // safe + useful for support
        product_id:      pid,
        product_name:    productsById[pid] || pid,                  // UX only
        start_utc:       s.start_utc || '',
        expires_utc:     s.expires_utc || '',
        status:          String(s.status||'').trim().toUpperCase(),  // should be ACTIVE here
        days_left:       daysLeft
      };
    }).sort((a,b) => {
      const ea = _parseUtc_(a.expires_utc); const eb = _parseUtc_(b.expires_utc);
      const ta = ea ? ea.getTime() : 0; const tb = eb ? eb.getTime() : 0;
      return tb - ta;
    });
  }

  // Build response (only add subscriptions when requested)
  const out = {
    ok: true,
    user: userOut,
    access: {
      courses: access.courses,
      expires_utc: access.expires_utc
    },
    flags,
    course_ids: access.courses,
    courses: courseMeta
  };

  // Optional: Telegram allowed group keys (browser-safe)
  // Call with: include=subscriptions,tg  (or include=tg)
  var inc = "," + String(include || "").replace(/\s+/g, "").toLowerCase() + ",";
  if (inc.indexOf(",tg,") !== -1 || inc.indexOf(",telegram,") !== -1) {
    out.allowed_group_keys = _getAllowedTelegramGroupKeysForUser_(u.user_id);
  }


  if(subsOut) out.subscriptions = subsOut;

  return _json(out);
}


/**
 * Server-to-server Telegram entitlements.
 * Protected by TG_ENTITLEMENTS_SECRET.
 *
 * Input:
 *  - secret (required)
 *  - user_id (preferred; stable)
 *  - qa_user_key (fallback; email or user_id)
 *
 * Output:
 *  - active_product_ids[]
 *  - allowed_group_keys[]   (union from products.telegram_group_keys)
 */
function apiTgEntitlementsByUserKey(args){
  try{
    var secret      = String(args.secret || '').trim();
    var user_id     = String(args.user_id || '').trim();
    var qa_user_key = String(args.qa_user_key || '').trim();

    // 1) Auth
    var expected = String(PropertiesService.getScriptProperties().getProperty('TG_ENTITLEMENTS_SECRET') || '').trim();
    if(!expected || secret !== expected){
      return _json({ ok:false, error:'unauthorized' }, 401);
    }

    // 2) Resolve user (prefer stable user_id)
    var u = null;

    if(user_id){
      u = _getUserById(user_id);
    } else if (qa_user_key){
      var k = qa_user_key.trim();
      // If looks like email, use email lookup; else try as user_id
      if(k.indexOf('@') !== -1){
        u = _getUserByEmail(k.toLowerCase());
      } else {
        u = _getUserById(k);
      }
    }

    if(!u) return _json({ ok:true, found:false, active_product_ids:[], allowed_group_keys:[] }, 200);
    if(!_toBool_(u.active)) return _json({ ok:true, found:true, active:false, active_product_ids:[], allowed_group_keys:[] }, 200);

    // 3) Active subscriptions
    var subs = _getActiveSubscriptionsForUser(u.user_id) || [];
    var activeProductIds = [];
    var seen = {};

    subs.forEach(function(s){
      var pid = String(s.product_id || '').trim().toUpperCase();
      if(!pid || seen[pid]) return;
      seen[pid] = true;
      activeProductIds.push(pid);
    });

    // 4) Allowed keys (reused shared helper)
    var allowedKeys = _getAllowedTelegramGroupKeysForUser_(u.user_id);



    return _json({
      ok:true,
      found:true,
      user_id: String(u.user_id || '').trim(),
      qa_user_key: String(u.email || '').trim().toLowerCase(),
      active_product_ids: activeProductIds,
      allowed_group_keys: allowedKeys
    }, 200);

  } catch(err){
    return _json({ ok:false, error:'server_error', detail:String(err && err.message ? err.message : err) }, 200);
  }
}


function apiLogout({token}){
  if(token) _deactivateToken(token);
  return _json({ok:true});
}

function apiResetRequest(args){
  var identifier = (args.identifier || '').trim().toLowerCase();
  var ua         = args.ua || '';
  var ip         = args.ip || '';
  var note       = args.note || '';

  if (!identifier) {
    return _json({ ok:false, error:'missing_identifier' });
  }

  var now    = _now();
  var nowIso = _iso(now);
  var ipHash = ip ? _hashWebSafeSHA256(ip) : '';
  var uaHash = ua ? _hashWebSafeSHA256(ua) : '';
  var reqId  = Utilities.getUuid();

  var sh      = _sh(SH_RESET);
  var headers = _headers(sh);

  // 1) Initial log row
  var logObj = {
    request_id:     reqId,
    identifier_raw: identifier,
    email:          '',
    username:       '',
    requested_utc:  nowIso,
    status:         'REQUESTED',
    action_note:    note || '',
    ip_hash:        ipHash,
    ua_hash:        uaHash,
    reset_token:    ''
  };
  _appendObj(sh, headers, logObj);

  // Helper to update this row by request_id
  function _updateResetRow(updates){
    var idx = _findRowIndexBy(sh, 'request_id', reqId);
    if (idx > 0) {
      var row = sh.getRange(idx,1,1,headers.length).getValues()[0];
      var obj = _rowToObj(headers,row);
      Object.keys(updates || {}).forEach(function(k){
        obj[k] = updates[k];
      });
      _updateObj(sh, headers, idx, obj);
    }
  }

  // 2) Basic rate limiting: max 3 requests per identifier in last 60 minutes
  try {
    var data   = _rows(SH_RESET);
    var rows   = data.rows || [];
    var cutoff = new Date(now.getTime() - 60 * 60 * 1000); // 60 minutes

    var recentCount = rows.filter(function(r){
      var raw = String(r.identifier_raw || '').trim().toLowerCase();
      if (raw !== identifier) return false;
      var t = _parseUtc_(r.requested_utc);
      return t && t >= cutoff;
    }).length;

    if (recentCount > 3) {
      _updateResetRow({
        status:      'RATE_LIMITED',
        action_note: 'Too many reset requests for this identifier in the last 60 minutes (' + recentCount + ')'
      });
      // Always respond with generic success to avoid leaking existence
      return _json({
        ok: true,
        message: 'If this account exists, a reset link has been sent.'
      });
    }
  } catch (e) {
    // On rate-limit check error, just log note and continue
    _updateResetRow({
      action_note: (logObj.action_note || '') + ' | rate_limit_error: ' + String(e)
    });
  }

  // 3) Resolve identifier → user (prefer email, then username)
  var user = _getUserByEmail(identifier);
  if (!user) {
    user = _getUserByUsername(identifier);
  }

  if (!user) {
    _updateResetRow({
      status:      'NO_USER',
      action_note: 'No matching user for identifier'
    });
    return _json({
      ok: true,
      message: 'If this account exists, a reset link has been sent.'
    });
  }

  if (!_toBool_(user.active)) {
    _updateResetRow({
      status:      'NO_USER',
      action_note: 'User inactive or disabled'
    });
    return _json({
      ok: true,
      message: 'If this account exists, a reset link has been sent.'
    });
  }

  // 4) Issue RESET token (kind = "RESET")
  var deviceLabel = 'Reset flow';
  var t = _issueToken(
    user.user_id,
    uaHash,
    ipHash,
    deviceLabel,
    'RESET_LINK',
    'RESET'       // kind
  );
  var resetToken = t.token;

  // 5) Update log row with resolved email/username + token
  _updateResetRow({
    email:       user.email || '',
    username:    user.username || '',
    status:      'TOKEN_CREATED',
    reset_token: resetToken,
    action_note: 'Reset token created'
  });

  // 6) Build reset link for the email
  var resetLink = RESET_PAGE_URL
    + '?rid=' + encodeURIComponent(reqId)
    + '&rt='  + encodeURIComponent(resetToken);

  // 7) Prepare email content (plain text + HTML via Drive template)
  var firstName   = (user.forename || user.name || '').trim();
  var displayName = firstName || (user.name || '').trim() || '';
  var greeting    = displayName ? ('Hi ' + displayName + ',') : 'Hi,';

  var subject   = 'Reset your QAcademy password';

  // Plain-text fallback
  var plainBody =
    greeting + '\n\n' +
    'You recently requested to reset your QAcademy password.\n\n' +
    'To choose a new password, open the link below:\n' +
    resetLink + '\n\n' +
    'If you did not request this, you can safely ignore this email.\n' +
    'For your security, this link only works for a short time and can only be used once.\n\n' +
    BRAND_NAME;

  // HTML from Drive template (warning theme)
  var htmlBody;
  try {
    htmlBody = _renderEmailFromDrive_(RESET_TEMPLATE_ID, {
      name:      displayName,
      resetLink: resetLink,
      brandName: BRAND_NAME
    });
  } catch (e) {
    // Fallback: very simple HTML if template fails for any reason
    Logger.log('Reset email template render failed: ' + e);
    htmlBody =
      '<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;font-size:14px;color:#111827;line-height:1.6;">' +
        '<p>' + greeting + '</p>' +
        '<p>You recently requested to reset your <b>QAcademy</b> password.</p>' +
        '<p>Open this link to choose a new password:</p>' +
        '<p><a href="' + resetLink + '" style="color:#0b7a75;text-decoration:underline;">' +
          resetLink +
        '</a></p>' +
        '<p style="font-size:12px;color:#4b5563;">' +
          'If you did not request this, you can ignore this email. The link will expire shortly.' +
        '</p>' +
        '<p style="margin-top:18px;font-size:11px;color:#9ca3af;">' +
          BRAND_NAME +
        '</p>' +
      '</div>';
  }


  // 8) Send email (but never reveal success/failure to the user on the front-end)
  try {
    _qaSendEmail_({
      to:      user.email,
      subject: subject,
      body:    plainBody,
      htmlBody: htmlBody,
      name:    BRAND_NAME
      // replyTo defaults to SUPPORT_EMAIL
      // from defaults to FROM_EMAIL (blank unless you set it + alias verified)
    });

    _updateResetRow({
      status:      'EMAIL_SENT',
      action_note: 'Reset email sent successfully'
    });
  } catch (e) {
    _updateResetRow({
      status:      'EMAIL_FAILED',
      action_note: 'Reset token created but email send failed: ' + String(e)
    });
  }

  // 9) Always generic response (no account existence leak)
  return _json({
    ok: true,
    message: 'If this account exists, a reset link has been sent.'
  });
}


function apiResetCheck(args){
  var request_id  = (args.request_id  || '').trim();
  var reset_token = (args.reset_token || '').trim();
  var ua          = args.ua || '';
  var ip          = args.ip || '';

  if (!request_id || !reset_token) {
    return _json({ ok:false, error:'missing_params', status:'invalid' });
  }

  var sh      = _sh(SH_RESET);
  var headers = _headers(sh);
  var idx     = _findRowIndexBy(sh, 'request_id', request_id);

  if (idx <= 0) {
    return _json({ ok:false, error:'invalid_request', status:'invalid' });
  }

  var row = sh.getRange(idx,1,1,headers.length).getValues()[0];
  var obj = _rowToObj(headers,row);

  // Wrong token for this request_id → invalid
  if (String(obj.reset_token || '').trim() !== reset_token) {
    return _json({ ok:false, error:'invalid_token_pair', status:'invalid' });
  }

  var status = String(obj.status || '').trim().toUpperCase();

  // If already used/expired/cancelled, treat as bad link
  if (status === 'USED' || status === 'EXPIRED' || status === 'CANCELLED') {
    // optional: log last_check_utc if your column exists
    obj.last_check_utc = _iso(_now());
    obj.status = 'EXPIRED';
    _updateObj(sh, headers, idx, obj);
    return _json({ ok:false, error:'reset_expired', status:'expired' });
  }

  // Check the token itself in SH_TOKENS
  var chk = _checkToken(reset_token);
  if (!chk.ok) {
    obj.last_check_utc = _iso(_now());
    obj.status = 'EXPIRED';
    _updateObj(sh, headers, idx, obj);
    return _json({ ok:false, error:'reset_expired', status:'expired' });
  }

  var t = chk.token || {};
  var kind = String(t.kind || '').trim().toUpperCase();
  if (kind && kind !== 'RESET') {
    obj.last_check_utc = _iso(_now());
    obj.status = 'INVALID';
    _updateObj(sh, headers, idx, obj);
    return _json({ ok:false, error:'wrong_token_kind', status:'invalid' });
  }

  // Mark that this link was checked and is OK
  obj.last_check_utc = _iso(_now());
  if (!status || status === 'EMAIL_SENT' || status === 'TOKEN_CREATED') {
    obj.status = 'CHECK_OK';
  }
  _updateObj(sh, headers, idx, obj);

  // Front end treats ok:true + status "valid" as green light
  return _json({ ok:true, status:'valid' });
}

function apiResetApply(args){
  var request_id   = (args.request_id   || '').trim();
  var reset_token  = (args.reset_token  || '').trim();
  var new_password = args.new_password || '';
  var ua           = args.ua || '';
  var ip           = args.ip || '';

  if (!request_id || !reset_token) {
    return _json({ ok:false, error:'missing_params' });
  }
  if (!new_password) {
    return _json({ ok:false, error:'missing_password' });
  }

  // Basic policy check (front end already enforces stronger rules)
  if (new_password.length < 8) {
    return _json({ ok:false, error:'password_policy_failed' });
  }

  var sh      = _sh(SH_RESET);
  var headers = _headers(sh);
  var idx     = _findRowIndexBy(sh, 'request_id', request_id);

  if (idx <= 0) {
    return _json({ ok:false, error:'invalid_request' });
  }

  var row = sh.getRange(idx,1,1,headers.length).getValues()[0];
  var obj = _rowToObj(headers,row);

  if (String(obj.reset_token || '').trim() !== reset_token) {
    return _json({ ok:false, error:'invalid_token_pair' });
  }

  var status = String(obj.status || '').trim().toUpperCase();
  if (status === 'USED' || status === 'EXPIRED' || status === 'CANCELLED') {
    return _json({ ok:false, error:'reset_expired' });
  }

  // Check the token in SH_TOKENS
  var chk = _checkToken(reset_token);
  if (!chk.ok) {
    obj.status = 'EXPIRED';
    obj.last_check_utc = _iso(_now());
    _updateObj(sh, headers, idx, obj);
    return _json({ ok:false, error:'reset_expired' });
  }

  var t = chk.token || {};
  var kind = String(t.kind || '').trim().toUpperCase();
  if (kind && kind !== 'RESET') {
    obj.status = 'INVALID';
    obj.last_check_utc = _iso(_now());
    _updateObj(sh, headers, idx, obj);
    return _json({ ok:false, error:'invalid_token' });
  }

  // Resolve user via token
  var user = _getUserById(t.user_id);
  if (!user) {
    return _json({ ok:false, error:'user_missing' });
  }
  if (!_toBool_(user.active)) {
    return _json({ ok:false, error:'user_inactive' });
  }

  // Update user's password (same logic as apiResetPassword)
  var shUsers      = _sh(SH_USERS);
  var headersUsers = _headers(shUsers);
  var idxUser      = _findRowIndexBy(shUsers, 'user_id', user.user_id);

  if (idxUser <= 0) {
    return _json({ ok:false, error:'user_row_not_found' });
  }

  var rowU = shUsers.getRange(idxUser,1,1,headersUsers.length).getValues()[0];
  var objU = _rowToObj(headersUsers,rowU);

  var newSalt = _generateSalt();
  var newHash = _hashWebSafeSHA256(newSalt + new_password);

  objU.salt                  = newSalt;
  objU.password_hash         = newHash;
  objU.must_change_password  = false;  // they just chose it
  _updateObj(shUsers, headersUsers, idxUser, objU);

  // Mark reset request as used
  obj.status      = 'USED';
  obj.used_utc    = _iso(_now());
  obj.action_note = (obj.action_note || '') + ' | password_changed';
  _updateObj(sh, headers, idx, obj);

  // Deactivate the RESET token so link can’t be reused
  _deactivateToken(reset_token);

  // (Optional future hardening: deactivate all LOGIN tokens for this user here)

  return _json({
    ok: true,
    message: 'password_updated'
  });
}

function apiResetPassword(args){
  var token    = (args.token || '').trim();
  var password = args.password || '';

  if (!token) {
    return _json({ ok:false, error:'missing_token' });
  }
  if (!password) {
    return _json({ ok:false, error:'missing_password' });
  }

  // 1) Validate token (must be active, unexpired)
  var chk = _checkToken(token);
  if (!chk.ok) {
    return _json({ ok:false, error:'invalid_or_expired' });
  }

  var t = chk.token || {};

  // 2) Ensure this is a RESET token (not a normal login token)
  var kind = String(t.kind || '').trim().toUpperCase();
  if (kind && kind !== 'RESET') {
    return _json({ ok:false, error:'wrong_token_kind' });
  }

  // 3) Resolve user
  var user = _getUserById(t.user_id);
  if (!user) {
    return _json({ ok:false, error:'user_missing' });
  }
  if (!_toBool_(user.active)) {
    return _json({ ok:false, error:'user_inactive' });
  }

  // 4) Update user's password (new salt + hash)
  var sh      = _sh(SH_USERS);
  var headers = _headers(sh);
  var idx     = _findRowIndexBy(sh, 'user_id', user.user_id);

  if (idx <= 0) {
    return _json({ ok:false, error:'user_row_not_found' });
  }

  var row = sh.getRange(idx,1,1,headers.length).getValues()[0];
  var obj = _rowToObj(headers,row);

  var newSalt = _generateSalt();
  var newHash = _hashWebSafeSHA256(newSalt + password);

  obj.salt              = newSalt;
  obj.password_hash     = newHash;
  obj.must_change_password = false;  // they just chose a new password

  _updateObj(sh, headers, idx, obj);

  // 5) Deactivate this RESET token
  _deactivateToken(token);

  // (Optional future step: deactivate all LOGIN tokens for this user to force re-login)

  return _json({
    ok: true,
    message: 'password_updated'
  });
}


/**
 * SELF-ONBOARDING: public signup route (Option A).
 * - Creates STUDENT user with chosen password
 * - Username can be chosen; else generated
 * - Ensures default trial subscription
 * - Sends welcome email INCLUDING username
 * - DOES NOT auto-login → returns redirect to login page
 */
function apiSelfRegister(args){
  var forename     = (args.forename || '').trim();
  var surname      = (args.surname || '').trim();
  var email        = (args.email || '').trim().toLowerCase();
  var password     = (args.password || '');
  var phone_number = (args.phone_number || '').trim();
  var program_id   = (args.program_id || '').trim();
  var cohort       = (args.cohort || '').trim();
  var avatar_url   = (args.avatar_url || '').trim();
  var ua           = (args.ua || '');
  var ip           = (args.ip || '');

  // NEW: username input (aligned with admin)
  var usernameInput = (args.username || '').trim().toLowerCase();

  // 1) Basic validation
  if (!forename || !surname || !email || !password) {
    return _json({ok:false, error:'missing_fields'});
  }

  // Optional minimal password policy
  if (String(password).length < 8) {
    return _json({ok:false, error:'password_policy_failed'});
  }

  // 2) Check duplicate email
  var existing = _getUserByEmail(email);
  if (existing) {
    return _json({ok:false, error:'email_exists'});
  }

  // 3) Decide username (SAME RULES AS ADMIN)
  var finalUsername = '';
  if (usernameInput) {
    if (!_isValidUsername_(usernameInput)) {
      return _json({ok:false, error:'invalid_username'});
    }
    var set1 = _getExistingUsernameSet_();
    if (set1.has(usernameInput)) {
      return _json({ok:false, error:'username_exists'});
    }
    finalUsername = usernameInput;
  } else {
    finalUsername = _generateUniqueUsernameFromForename_(forename);
  }

  // 4) Generate user_id, hash
  var user_id  = _generateUserId_();
  var salt     = _generateSalt();
  var hash     = _hashWebSafeSHA256(salt + password);

  var nowIso = _iso(_now());
  var name   = [forename, surname].filter(Boolean).join(' ');

  var sh      = _sh(SH_USERS);
  var headers = _headers(sh);

  var obj = {
    user_id:      user_id,
    username:     finalUsername,
    name:         name,
    forename:     forename,
    surname:      surname,
    email:        email,
    phone_number: phone_number,
    program_id:   program_id,
    cohort:       cohort,
    avatar_url:   avatar_url,
    salt:         salt,
    password_hash: hash,
    must_change_password: false,
    role:         'STUDENT',
    active:       true,
    expires_utc:  '',
    created_utc:  nowIso,
    last_login_utc: ''
  };

  // Write signup_source ONLY if column exists
  if (headers.indexOf('signup_source') !== -1) {
    obj.signup_source = 'SELF';
  }

  _appendObj(sh, headers, obj);

  // 5) Ensure default TRIAL subscription
  try {
    _ensureDefaultTrialSubscriptionForUser_(user_id, 'WELCOME_TRIAL');
  } catch (e) {
    Logger.log('Error in _ensureDefaultTrialSubscriptionForUser_ (self_register): ' + e);
  }

  // 6) Send welcome email
  try {
    _sendWelcomeEmailForUser_(obj, 'SELF', { username: finalUsername });
  } catch (e) {
    Logger.log('Welcome email error (SELF register): ' + e);
  }

  // 7) NO AUTO-LOGIN. Redirect to login page (Option A)
  // You must define LOGIN_PAGE_URL in auth_config.gs
  var redirect = LOGIN_PAGE_URL + '?reg=1&u=' + encodeURIComponent(finalUsername);

  return _json({
    ok: true,
    user_id: user_id,
    username: finalUsername,
    redirect: redirect,
    signup_via: 'self_register'
  });
}

/**
 * PAID SELF-ONBOARDING: public signup route (creates account only).
 * - Creates STUDENT user with chosen password
 * - Username can be chosen; else generated (same rules as admin/self_register)
 * - DOES NOT assign trial subscription
 * - DOES NOT send the normal welcome email (you’ll send “welcome/activation” after payment)
 * - Returns identifiers for the Payments WebApp to use (user_id/email/username)
 */
function apiSelfRegisterPaid(args){
  var forename     = (args.forename || '').trim();
  var surname      = (args.surname || '').trim();
  var email        = (args.email || '').trim().toLowerCase();
  var password     = (args.password || '');
  var phone_number = (args.phone_number || '').trim();
  var program_id   = (args.program_id || '').trim();
  var cohort       = (args.cohort || '').trim();
  var avatar_url   = (args.avatar_url || '').trim();
  var ua           = (args.ua || '');
  var ip           = (args.ip || '');

  var usernameInput = (args.username || '').trim().toLowerCase();
  var product_id    = (args.product_id || '').trim().toUpperCase(); // optional, for audit only

  if (!forename || !surname || !email || !password) {
    return _json({ok:false, error:'missing_fields'});
  }
  if (String(password).length < 8) {
    return _json({ok:false, error:'password_policy_failed'});
  }

  // duplicate email
  var existing = _getUserByEmail(email);
  if (existing) {
    return _json({ok:false, error:'email_exists'});
  }

  // username rules (same as self_register/admin)
  var finalUsername = '';
  if (usernameInput) {
    if (!_isValidUsername_(usernameInput)) return _json({ok:false, error:'invalid_username'});
    var set1 = _getExistingUsernameSet_();
    if (set1.has(usernameInput)) return _json({ok:false, error:'username_exists'});
    finalUsername = usernameInput;
  } else {
    finalUsername = _generateUniqueUsernameFromForename_(forename);
  }

  // create user
  var user_id  = _generateUserId_();
  var salt     = _generateSalt();
  var hash     = _hashWebSafeSHA256(salt + password);

  var nowIso = _iso(_now());
  var name   = [forename, surname].filter(Boolean).join(' ');

  var sh      = _sh(SH_USERS);
  var headers = _headers(sh);

  var obj = {
    user_id:      user_id,
    username:     finalUsername,
    name:         name,
    forename:     forename,
    surname:      surname,
    email:        email,
    phone_number: phone_number,
    program_id:   program_id,
    cohort:       cohort,
    avatar_url:   avatar_url,
    salt:         salt,
    password_hash: hash,
    must_change_password: false,
    role:         'STUDENT',
    active:       true,
    expires_utc:  '',
    created_utc:  nowIso,
    last_login_utc: ''
  };

  // signup_source if column exists
  if (headers.indexOf('signup_source') !== -1) obj.signup_source = 'SELF_PAID';

  // Optional audit column if you ever add it
  if (headers.indexOf('pending_product_id') !== -1) obj.pending_product_id = product_id;

  _appendObj(sh, headers, obj);

  // Optional: you can send a “payment pending” email later; for now keep quiet.
  // (If you DO want to send your normal welcome email, do it here.)

  return _json({
    ok: true,
    user_id: user_id,
    username: finalUsername,
    email: email,
    phone_number: phone_number,
    signup_via: 'self_register_paid'
  });
}

/**
 * TA SELF-ONBOARDING (public signup for Teacher Assess).
 * - Creates STUDENT user with chosen password
 * - Username same rules as admin/self_register
 * - DOES NOT assign any subscription (NO old Alpha trial/products)
 * - Optional: does NOT send the normal licensure welcome email (keeps TA clean)
 * - Returns redirect to login
 *
 * IMPORTANT: includes write verification so frontend never shows success if row wasn't written.
 */
function apiSelfRegisterTA(args){
  var forename     = (args.forename || '').trim();
  var surname      = (args.surname || '').trim();
  var email        = (args.email || '').trim().toLowerCase();
  var password     = (args.password || '');
  var phone_number = (args.phone_number || '').trim();
  var program_id   = (args.program_id || '').trim();
  var cohort       = (args.cohort || '').trim();
  var avatar_url   = (args.avatar_url || '').trim();
  var ua           = (args.ua || '');
  var ip           = (args.ip || '');

  var usernameInput = (args.username || '').trim().toLowerCase();

  // 1) Basic validation
  if (!forename || !surname || !email || !password) {
    return _json({ ok:false, error:'missing_fields' });
  }
  if (String(password).length < 8) {
    return _json({ ok:false, error:'password_policy_failed' });
  }

  // 2) Duplicate email check
  var existing = _getUserByEmail(email);
  if (existing) {
    return _json({ ok:false, error:'email_exists' });
  }

  // 3) Username rules (same as admin/self_register)
  var finalUsername = '';
  if (usernameInput) {
    if (!_isValidUsername_(usernameInput)) {
      return _json({ ok:false, error:'invalid_username' });
    }
    var set1 = _getExistingUsernameSet_();
    if (set1.has(usernameInput)) {
      return _json({ ok:false, error:'username_exists' });
    }
    finalUsername = usernameInput;
  } else {
    finalUsername = _generateUniqueUsernameFromForename_(forename);
  }

  // 4) Create user row
  var user_id  = _generateUserId_();
  var salt     = _generateSalt();
  var hash     = _hashWebSafeSHA256(salt + password);

  var nowIso = _iso(_now());
  var name   = [forename, surname].filter(Boolean).join(' ');

  var sh      = _sh(SH_USERS);
  var headers = _headers(sh);

  var obj = {
    user_id:      user_id,
    username:     finalUsername,
    name:         name,
    forename:     forename,
    surname:      surname,
    email:        email,
    phone_number: phone_number,
    program_id:   program_id,
    cohort:       cohort,
    avatar_url:   avatar_url,
    salt:         salt,
    password_hash: hash,
    must_change_password: false,
    role:         'STUDENT',
    active:       true,
    expires_utc:  '',
    created_utc:  nowIso,
    last_login_utc: ''
  };

  // tag source if column exists
  if (headers.indexOf('signup_source') !== -1) {
    obj.signup_source = 'TA_SELF';
  }

  // 5) WRITE
  _appendObj(sh, headers, obj);

  // TA welcome email (best-effort)
try {
  _emailTaWelcome_({
    email: obj.email,
    name: obj.name || (obj.forename + ' ' + obj.surname),
    username: finalUsername
  });
} catch(e) {
  Logger.log('TA welcome email failed: ' + e);
}


  // 6) VERIFY write (prevents false “Account created”)
  var idx = -1;
  try {
    idx = _findRowIndexBy(sh, 'user_id', user_id);
  } catch (e) {
    // fallback if helper differs
    idx = -1;
  }
  if (!(idx > 0)) {
    // second check by email (sometimes user_id column name mismatch)
    try {
      idx = _findRowIndexBy(sh, 'email', email);
    } catch (e2) {
      idx = -1;
    }
  }
  if (!(idx > 0)) {
    return _json({ ok:false, error:'write_failed_users', detail:'User row not found after append' });
  }

  // 7) TA wording redirect to login
  // NOTE: ensure LOGIN_PAGE_URL is defined in auth_config.gs
  var redirect = LOGIN_PAGE_URL + '?reg=1&u=' + encodeURIComponent(finalUsername);

  return _json({
    ok: true,
    wrote: true,
    user_id: user_id,
    username: finalUsername,
    redirect: redirect,
    signup_via: 'self_register_ta'
  });
}

/**
 * Time-driven cron entrypoint for subscription expiry reminders.
 * Attach a daily Apps Script time-driven trigger to this function.
 */
function cronSendExpiryReminders() {
  var res = _runExpiryRemindersCore_();
  Logger.log(
    'cronSendExpiryReminders: scanned=' + res.scanned +
    ', sent=' + res.sent +
    ', sentByDay=' + JSON.stringify(res.sentByDay || {})
  );
}

