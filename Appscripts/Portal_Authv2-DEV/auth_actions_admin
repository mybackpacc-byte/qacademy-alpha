/** ============================================================
 * QAcademy Portal — Auth Actions (Admin)
 * Admin-only API endpoints:
 * create user, assign product, list users/subs,
 * token audit, auth event audit, expiry reminders.
 * Light routing + validation; heavy work delegated to
 * core_domain helpers.
 * ============================================================ */


/* ========= auth_actions_admin.gs ========= */


/* ========= ADMIN: Create User ========= */

function apiCreateUser(args){
  var token        = args.token || '';
  var forename     = (args.forename || '').trim();
  var surname      = (args.surname || '').trim();
  var email        = (args.email || '').trim().toLowerCase();
  var phone_number = (args.phone_number || '').trim();
  var program_id   = (args.program_id || '').trim();
  var cohort       = (args.cohort || '').trim();
  var roleInput    = (args.role || '').trim();
  var usernameInput= (args.username || '').trim().toLowerCase();
  var avatar_url   = (args.avatar_url || '').trim();
  var activeRaw    = (args.active || '').trim();
  var mustChangeRaw= (args.must_change_password || '').trim();

  if(!token)    return _json({ok:false, error:'missing_token'});
  if(!forename || !surname || !email){
    return _json({ok:false, error:'missing_fields'});
  }

  // 1) Check caller token
  var chk = _checkToken(token);
  if(!chk.ok) return _json({ok:false, error:chk.reason || 'invalid_token'});

  var caller = _getUserById(chk.token.user_id);
  if(!caller) return _json({ok:false, error:'caller_missing'});
  if(!_toBool_(caller.active)) return _json({ok:false, error:'caller_inactive'});

  var callerRoleUpper = String(caller.role || '').trim().toUpperCase();
  var callerIsAdmin     = callerRoleUpper === 'ADMIN';
  var callerIsModerator = callerRoleUpper === 'MODERATOR';

  // Only ADMIN or MODERATOR may create users
  if(!callerIsAdmin && !callerIsModerator){
    return _json({ok:false, error:'forbidden'});
  }

  // 2) Check for duplicate email
  var existing = _getUserByEmail(email);
  if(existing){
    return _json({ok:false, error:'email_exists'});
  }

  // 3) Decide role for new user
  var allowedRoles = ['STUDENT','ADMIN','MODERATOR'];
  var roleUpper    = roleInput ? roleInput.toUpperCase() : '';
  var finalRole    = 'STUDENT';

  if(allowedRoles.indexOf(roleUpper) >= 0){
    // Only ADMIN caller can grant ADMIN or MODERATOR; STUDENT is fine.
    if(roleUpper === 'ADMIN' || roleUpper === 'MODERATOR'){
      if(callerIsAdmin){
        finalRole = roleUpper;
      } else {
        finalRole = 'STUDENT';
      }
    } else {
      finalRole = 'STUDENT';
    }
  }

  // 4) Decide username
  var finalUsername = '';
  if(usernameInput){
    if(!_isValidUsername_(usernameInput)){
      return _json({ok:false, error:'invalid_username'});
    }
    var set1 = _getExistingUsernameSet_();
    if(set1.has(usernameInput)){
      return _json({ok:false, error:'username_exists'});
    }
    finalUsername = usernameInput;
  } else {
    finalUsername = _generateUniqueUsernameFromForename_(forename);
  }

  // 5) Generate credentials
  var user_id      = _generateUserId_();
  var tempPassword = _randomTempPassword_();
  var salt         = _generateSalt();
  var hash         = _hashWebSafeSHA256(salt + tempPassword);

  var nowIso = _iso(_now());
  var name   = [forename, surname].filter(Boolean).join(' ');

  var isActive    = activeRaw ? _toBool_(activeRaw) : true;
  var mustChange  = mustChangeRaw ? _toBool_(mustChangeRaw) : true;

  // 6) Insert into users sheet
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
    must_change_password: mustChange,
    role:         finalRole,
    active:       isActive,
    expires_utc:  '',
    created_utc:  nowIso,
    last_login_utc: ''
  };

  // NEW: record how this account was created
  if (headers.indexOf('signup_source') !== -1) {
    if (callerIsAdmin) {
      obj.signup_source = 'ADMIN';
    } else if (callerIsModerator) {
      obj.signup_source = 'MODERATOR';
    } else {
      obj.signup_source = 'ADMIN_PANEL'; // fallback label if ever needed
    }
  }

  _appendObj(sh, headers, obj);

  // NEW: ensure default trial subscription (WELCOME_TRIAL) if no PAID/FREE
  try {
    _ensureDefaultTrialSubscriptionForUser_(user_id, 'WELCOME_TRIAL');
  } catch (e) {
    // Fail silently but log for debugging; do not block user creation
    Logger.log('Error in _ensureDefaultTrialSubscriptionForUser_: ' + e);
  }

  // NEW: send welcome email for admin/moderator-created account
  try {
    _sendWelcomeEmailForUser_(obj, 'ADMIN', {
      tempPassword: tempPassword
      // productName: you can pass a real product name here later if you want
    });
  } catch (e) {
    Logger.log('Welcome email error (ADMIN create): ' + e);
  }

  return _json({
    ok: true,
    user_id: user_id,
    username: finalUsername,
    temp_password: tempPassword,
    role: finalRole,
    name: name,
    email: email
  });
}

/**
 * PAYMENTS: server-to-server activation (no admin token).
 * Input:
 *  - secret [required] shared secret
 *  - user_id OR email [required]
 *  - product_id [required]
 *  - source (e.g. PAYSTACK) [required]
 *  - source_ref (Paystack reference) [required]
 *
 * Behaviour (UPDATED):
 *  - Validates shared secret
 *  - Concurrency-safe (LockService) to avoid rare double-writes
 *  - Idempotent: if ANY subscription row already contains (source, source_ref) -> return it
 *      NOTE: source_ref may be pipe-delimited "ref1|ref2|ref3" so we can preserve history
 *  - If user already has ACTIVE + unexpired subscription for SAME product_id -> EXTEND expires_utc
 *      base = max(current_expires_utc, now)
 *      newExpires = base + duration_days
 *      Also appends source_ref to pipe-list (for durable idempotency across retries)
 *  - Else: inserts NEW ACTIVE subscription (start now, expires = now+duration_days)
 * UPDATED PATCH:
 *  - Pass ctx.event to _sendProductAssignedEmail_ so the email copy matches:
 *      • extend/renewal  -> "Access updated"
 *      • new activation  -> "Access active"
 *
 * NOTE:
 *  - No change to API inputs.
 *  - Only change is adding `event` in the ctx object at the two call sites.
 */
function apiPaymentsActivate(args){
  var secret     = (args.secret     || '').trim();
  var user_id    = (args.user_id    || '').trim();
  var email      = (args.email      || '').trim().toLowerCase();
  var product_id = (args.product_id || '').trim().toUpperCase();
  var source     = (args.source     || '').trim().toUpperCase();
  var source_ref = (args.source_ref || '').trim();

  if(!secret) return _json({ok:false, error:'missing_secret'});
  if(!product_id) return _json({ok:false, error:'missing_product_id'});
  if(!source || !source_ref) return _json({ok:false, error:'missing_source_ref'});
  if(!user_id && !email) return _json({ok:false, error:'missing_user_ref'});

  // Validate shared secret (set PORTAL_PAYMENTS_SECRET in Script Properties)
  var expected = PropertiesService.getScriptProperties().getProperty('PORTAL_PAYMENTS_SECRET') || '';
  if(!expected || secret !== expected) return _json({ok:false, error:'forbidden'});

  // Resolve user (kept outside lock is fine; we still re-read subs inside lock)
  var targetUser = email ? _getUserByEmail(email) : _getUserById(user_id);
  if(!targetUser) return _json({ok:false, error:'user_not_found'});
  if(!_toBool_(targetUser.active)) return _json({ok:false, error:'user_inactive'});
  var resolvedUserId = targetUser.user_id;

  // Resolve product
  var product = _getProductById(product_id);
  if(!product) return _json({ok:false, error:'product_not_found'});

  var pStatus = String(product.status || '').trim().toUpperCase();
  if(pStatus && pStatus !== 'ACTIVE') return _json({ok:false, error:'product_inactive'});

  var duration = parseInt(product.duration_days, 10);
  if(!duration || duration <= 0) return _json({ok:false, error:'product_duration_invalid'});

  // Helpers: treat source_ref as either single ref OR a pipe-delimited list.
  function _refList_(cell){
    var s = String(cell || '').trim();
    if(!s) return [];
    // split on pipe; ignore empty parts
    return s.split('|').map(function(x){ return String(x||'').trim(); }).filter(Boolean);
  }
  function _refsHas_(cell, ref){
    if(!ref) return false;
    var list = _refList_(cell);
    // Fast-path exact match for common case (single value)
    if(list.length === 0) return false;
    return list.indexOf(ref) !== -1;
  }
  function _refsAppendUnique_(cell, ref){
    if(!ref) return String(cell || '').trim();
    var list = _refList_(cell);
    if(list.indexOf(ref) === -1) list.push(ref);
    // Keep as pipe list; safe for existing single-value cells too
    return list.join('|');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // up to 30s; prevents duplicate rows if Paystack retries quickly
  try {
    // Load subscriptions INSIDE lock (this matters)
    var sh      = _sh(SH_SUBSCRIPTIONS);
    var headers = _headers(sh);
    var data    = _rows(SH_SUBSCRIPTIONS);
    var rows    = data.rows || [];

    // Column presence + indexes (for updates)
    var hasSource    = headers.indexOf('source') !== -1;
    var hasSourceRef = headers.indexOf('source_ref') !== -1;

    var colSubscriptionId = headers.indexOf('subscription_id') + 1; // 1-based
    var colUserId         = headers.indexOf('user_id') + 1;
    var colProductId      = headers.indexOf('product_id') + 1;
    var colStartUtc       = headers.indexOf('start_utc') + 1;
    var colExpiresUtc     = headers.indexOf('expires_utc') + 1;
    var colStatus         = headers.indexOf('status') + 1;
    var colSource         = hasSource ? (headers.indexOf('source') + 1) : 0;
    var colSourceRef      = hasSourceRef ? (headers.indexOf('source_ref') + 1) : 0;

    // If columns exist, enforce idempotency via (source, source_ref)
    // UPDATED: checks if the row's source_ref LIST already contains this reference.
    if(hasSource && hasSourceRef){
      var existing = rows.find(function(r){
        var rSource = String(r.source||'').trim().toUpperCase();
        if(rSource !== source) return false;
        return _refsHas_(r.source_ref, source_ref);
      });
      if(existing){
        // Return what we can without mutating anything
        return _json({
          ok:true,
          idempotent:true,
          subscription_id: existing.subscription_id || '',
          user_id: resolvedUserId,
          product_id: product_id,
          expires_utc: existing.expires_utc || ''
        });
      }
    }

    var now  = _now();
    var nowT = now.getTime();

    // Find ACTIVE + unexpired subscription(s) for SAME product_id (repurchase/renewal)
    var candidates = [];
    rows.forEach(function(r, idx){
      if(String(r.user_id||'').trim() !== String(resolvedUserId||'').trim()) return;
      if(String(r.product_id||'').trim().toUpperCase() !== product_id) return;
      if(String(r.status||'').trim().toUpperCase() !== 'ACTIVE') return;

      var exp = _parseUtc_(r.expires_utc);
      if(exp && exp.getTime() <= nowT) return; // expired -> not a candidate
      candidates.push({ r:r, idx:idx, exp:exp });
    });

    if(candidates.length){
      // Choose the candidate with the latest expires_utc (handles legacy duplicates safely)
      candidates.sort(function(a,b){
        var at = a.exp ? a.exp.getTime() : 0;
        var bt = b.exp ? b.exp.getTime() : 0;
        return bt - at;
      });

      var pick = candidates[0];
      var pickedRow = pick.r;
      var i = pick.idx;

      // Sheet row number: rows[] correspond to sheet rows starting at row 2
      var sheetRow = i + 2;

      var prevExp = _parseUtc_(pickedRow.expires_utc);
      var base = (prevExp && prevExp.getTime() > nowT) ? prevExp : now;
      var newExp = _addDays(base, duration);

      var newExpIso = _iso(newExp);

      // Update expires_utc (and keep status ACTIVE)
      sh.getRange(sheetRow, colExpiresUtc).setValue(newExpIso);
      if(colStatus) sh.getRange(sheetRow, colStatus).setValue('ACTIVE');

      // Update source/source_ref for this subscription record
      // IMPORTANT: store a pipe-delimited list of refs so idempotency remains durable.
      if(hasSource) sh.getRange(sheetRow, colSource).setValue(source);
      if(hasSourceRef){
        var updatedRefs = _refsAppendUnique_(pickedRow.source_ref, source_ref);
        sh.getRange(sheetRow, colSourceRef).setValue(updatedRefs);
      }

      // Email (best-effort): ✅ event UPDATED -> "Access updated"
      try {
        var patchedSubObj = {
          subscription_id: pickedRow.subscription_id || '',
          user_id:         resolvedUserId,
          product_id:      product_id,
          start_utc:       pickedRow.start_utc || _iso(now),
          expires_utc:     newExpIso,
          status:          'ACTIVE',
          source:          hasSource ? source : undefined,
          source_ref:      hasSourceRef ? _refsAppendUnique_(pickedRow.source_ref, source_ref) : undefined
        };

        _sendProductAssignedEmail_(targetUser, product, patchedSubObj, {
          source: source,
          reference: source_ref,
          event: 'UPDATED' // ✅ NEW
        });
      } catch (e) {
        Logger.log('payments_activate (extend) email failed: ' + e);
      }

      return _json({
        ok:true,
        extended:true,
        subscription_id: pickedRow.subscription_id || '',
        user_id: resolvedUserId,
        product_id: product_id,
        previous_expires_utc: prevExp ? _iso(prevExp) : '',
        expires_utc: newExpIso
      });
    }

    // No active unexpired same-product subscription -> create NEW subscription row
    var startIso = _iso(now);
    var expIso   = _iso(_addDays(now, duration));
    var subscription_id = 'S_' + Utilities.getUuid().replace(/-/g,'').slice(0,10);

    var subObj = {
      subscription_id: subscription_id,
      user_id:         resolvedUserId,
      product_id:      product_id,
      start_utc:       startIso,
      expires_utc:     expIso,
      status:          'ACTIVE'
    };

    if(hasSource)    subObj.source = source;
    if(hasSourceRef) subObj.source_ref = source_ref; // single ref for new row

    _appendObj(sh, headers, subObj);

    // Email (best-effort): ✅ event ACTIVATED -> "Access is now active"
    try {
      _sendProductAssignedEmail_(targetUser, product, subObj, {
        source: source,
        reference: source_ref,
        event: 'ACTIVATED' // ✅ NEW
      });
    } catch (e) {
      Logger.log('payments_activate (create) email failed: ' + e);
    }

    return _json({
      ok:true,
      created:true,
      subscription_id: subscription_id,
      user_id: resolvedUserId,
      product_id: product_id,
      start_utc: startIso,
      expires_utc: expIso
    });

  } finally {
    try { lock.releaseLock(); } catch(e){}
  }
}


/* ========= ADMIN: Products & Subscriptions ========= */

function apiListProducts(args){
  var token = args.token || '';
  if(!token) return _json({ok:false, error:'missing_token'});

  var chk = _checkToken(token);
  if(!chk.ok) return _json({ok:false, error:chk.reason || 'invalid_token'});

  var caller = _getUserById(chk.token.user_id);
  if(!caller) return _json({ok:false, error:'caller_missing'});
  if(!_toBool_(caller.active)) return _json({ok:false, error:'caller_inactive'});

  var callerIsAdmin = String(caller.role || '').trim().toUpperCase() === 'ADMIN';
  if(!callerIsAdmin) return _json({ok:false, error:'forbidden'});

  var {rows} = _rows(SH_PRODUCTS);
  var out = rows.map(function(r){
    return {
      product_id:       r.product_id || '',
      name:             r.name || '',
      courses_included: r.courses_included || '',
      duration_days:    r.duration_days || '',
      status:           r.status || ''
    };
  });

  return _json({ ok:true, products: out });
}

function apiAssignProduct(args){
  var token        = args.token || '';
  var user_id      = (args.user_id || '').trim();
  var target_email = (args.target_email || '').trim().toLowerCase();
  var product_id   = (args.product_id || '').trim().toUpperCase();
  var start_utc_in = (args.start_utc || '').trim();

  if(!token)      return _json({ok:false, error:'missing_token'});
  if(!product_id) return _json({ok:false, error:'missing_product_id'});
  if(!user_id && !target_email){
    return _json({ok:false, error:'missing_user_ref'});
  }

  // 1) Check caller token & admin role
  var chk = _checkToken(token);
  if(!chk.ok) return _json({ok:false, error:chk.reason || 'invalid_token'});

  var caller = _getUserById(chk.token.user_id);
  if(!caller) return _json({ok:false, error:'caller_missing'});
  if(!_toBool_(caller.active)) return _json({ok:false, error:'caller_inactive'});

  var callerIsAdmin = String(caller.role || '').trim().toUpperCase() === 'ADMIN';
  if(!callerIsAdmin) return _json({ok:false, error:'forbidden'});

  // 2) Resolve target user (email wins if provided)
  var targetUser = null;
  if(target_email){
    targetUser = _getUserByEmail(target_email);
  } else if(user_id){
    targetUser = _getUserById(user_id);
  }

  if(!targetUser){
    return _json({ok:false, error:'user_not_found'});
  }
  if(!_toBool_(targetUser.active)){
    return _json({ok:false, error:'user_inactive'});
  }

  var resolvedUserId = targetUser.user_id;

  // 3) Resolve product
  var product = _getProductById(product_id);
  if(!product){
    return _json({ok:false, error:'product_not_found'});
  }

  var pStatus = String(product.status || '').trim().toUpperCase();
  if(pStatus && pStatus !== 'ACTIVE'){
    return _json({ok:false, error:'product_inactive'});
  }

  var duration = parseInt(product.duration_days, 10);
  if(!duration || duration <= 0){
    return _json({ok:false, error:'product_duration_invalid'});
  }

  // 4) Compute start_utc + expires_utc
  var now = _now();
  var startDate = start_utc_in ? _parseUtc_(start_utc_in) : now;
  if(!startDate){
    startDate = now;
  }
  var expDate   = _addDays(startDate, duration);

  var startIso  = _iso(startDate);
  var expIso    = _iso(expDate);

  // 5) Check for existing active, unexpired subscription for same user+product
  var {rows: subRows} = _rows(SH_SUBSCRIPTIONS);
  var nowTime = now.getTime();

  var hasActive = subRows.some(function(r){
    if(String(r.user_id || '').trim() !== String(resolvedUserId || '').trim()) return false;
    if(String(r.product_id || '').trim().toUpperCase() !== product_id) return false;

    var status = String(r.status || '').trim().toUpperCase();
    if(status !== 'ACTIVE') return false;

    var exp = _parseUtc_(r.expires_utc);
    if(exp && exp.getTime() <= nowTime) return false; // expired

    return true;
  });

  if(hasActive){
    return _json({ok:false, error:'subscription_exists'});
  }

  // 6) Insert into subscriptions
  var sh      = _sh(SH_SUBSCRIPTIONS);
  var headers = _headers(sh);

  var subscription_id = 'S_' + Utilities.getUuid().replace(/-/g,'').slice(0,10);

  var subObj = {
    subscription_id: subscription_id,
    user_id:         resolvedUserId,
    product_id:      product_id,
    start_utc:       startIso,
    expires_utc:     expIso,
    status:          'ACTIVE'
  };

  _appendObj(sh, headers, subObj);

  // 7) Send email with explicit event so template uses "Access granted" copy
  try {
    _sendProductAssignedEmail_(targetUser, product, subObj, {
      source: 'ADMIN',
      event: 'ASSIGNED' // ✅ NEW: admin assignment wording
      // reference intentionally omitted for admin flow
    });
  } catch (e) {
    Logger.log('Failed to send Product Assigned email: ' + e);
  }

  return _json({
    ok: true,
    subscription_id: subscription_id,
    user_id: resolvedUserId,
    product_id: product_id,
    start_utc: startIso,
    expires_utc: expIso
  });
}


/**
 * Admin-only: list tokens for audit.
 *
 * Input (via POST):
 *  - token           (admin's token) [required]
 *  - filter_user_id  [optional] → only tokens for this user_id
 *  - filter_email    [optional] → only tokens for this email (case-insensitive)
 *  - active_only     [optional] → "true"/"1"/"yes" => only active tokens
 *  - limit           [optional] → max number of rows to return (default 200)
 *
 * Behaviour:
 *  - Requires ADMIN caller.
 *  - Joins tokens with users to include email, name, program, role.
 *  - Does NOT expose ua_hash or ip_hash (privacy).
 *  - Sorted by issued_utc DESC (most recent sessions first).
 */
function apiListTokens(args){
  var token          = args.token || '';
  var filter_user_id = (args.filter_user_id || '').trim();
  var filter_email   = (args.filter_email   || '').trim().toLowerCase();
  var active_only    = _toBool_(args.active_only);
  var limitRaw       = parseInt(args.limit, 10);
  var limit          = (isNaN(limitRaw) || limitRaw <= 0) ? 200 : limitRaw;

  if(!token) return _json({ok:false, error:'missing_token'});

  // 1) Check caller token & admin role
  var chk = _checkToken(token);
  if(!chk.ok) return _json({ok:false, error:chk.reason || 'invalid_token'});

  var caller = _getUserById(chk.token.user_id);
  if(!caller) return _json({ok:false, error:'caller_missing'});
  if(!_toBool_(caller.active)) return _json({ok:false, error:'caller_inactive'});

  var callerIsAdmin = String(caller.role || '').trim().toUpperCase() === 'ADMIN';
  if(!callerIsAdmin) return _json({ok:false, error:'forbidden'});

  // 2) Load tokens + user map
  var tokenData = _rows(SH_TOKENS);
  var tokens    = tokenData.rows;

  var userData  = _rows(SH_USERS);
  var users     = userData.rows;
  var userById  = {};
  users.forEach(function(u){
    if(u.user_id){
      userById[String(u.user_id)] = u;
    }
  });

  // 3) Build merged objects and apply filters
  var merged = tokens.map(function(r){
    var u   = userById[String(r.user_id || '')] || {};
    var act = _toBool_(r.active);

    return {
      token:        r.token || '',
      user_id:      r.user_id || '',
      name:         u.name || [u.forename, u.surname].filter(Boolean).join(' '),
      email:        u.email || '',
      program_id:   u.program_id || '',
      role:         u.role || '',
      device_label: r.device_label || '',
      login_via:    r.login_via || '',
      issued_utc:   r.issued_utc || '',
      last_seen_utc:r.last_seen_utc || '',
      expires_utc:  r.expires_utc || '',
      active:       act
    };
  }).filter(function(row){
    if(filter_user_id && String(row.user_id || '') !== filter_user_id) return false;
    if(filter_email){
      if(String(row.email || '').trim().toLowerCase() !== filter_email) return false;
    }
    if(active_only && !row.active) return false;
    return true;
  });

  // 4) Sort by issued_utc DESC (most recent at top)
  merged.sort(function(a,b){
    var da = _parseUtc_(a.issued_utc) || new Date(0);
    var db = _parseUtc_(b.issued_utc) || new Date(0);
    return db - da; // DESC
  });

  // 5) Limit result size
  if(merged.length > limit){
    merged = merged.slice(0, limit);
  }

  return _json({
    ok: true,
    tokens: merged
  });
}

/**
 * Admin-only: revoke (deactivate) a specific token.
 *
 * Input:
 *  - token         (admin's token) [required]
 *  - target_token  (the session token to revoke) [required]
 *
 * Behaviour:
 *  - Requires ADMIN caller.
 *  - Deactivates the target token using _deactivateToken (idempotent).
 *  - Returns basic info including target_user_id if found.
 */
function apiAdminRevokeToken(args){
  var adminToken  = args.token || '';
  var targetToken = args.target_token || '';

  if(!adminToken)  return _json({ok:false, error:'missing_token'});
  if(!targetToken) return _json({ok:false, error:'missing_target_token'});

  // 1) Check caller token & admin
  var chk = _checkToken(adminToken);
  if(!chk.ok) return _json({ok:false, error:chk.reason || 'invalid_token'});

  var caller = _getUserById(chk.token.user_id);
  if(!caller) return _json({ok:false, error:'caller_missing'});
  if(!_toBool_(caller.active)) return _json({ok:false, error:'caller_inactive'});

  var callerIsAdmin = String(caller.role || '').trim().toUpperCase() === 'ADMIN';
  if(!callerIsAdmin) return _json({ok:false, error:'forbidden'});

  // 2) Optional: look up the token row to capture user_id for the response
  var tokenSheet = _sh(SH_TOKENS);
  var headers    = _headers(tokenSheet);
  var idx        = _findRowIndexBy(tokenSheet, 'token', targetToken);
  var targetUserId = '';

  if(idx > 0){
    var row = tokenSheet.getRange(idx,1,1,headers.length).getValues()[0];
    var obj = _rowToObj(headers,row);
    targetUserId = obj.user_id || '';
  }

  // 3) Deactivate using existing helper (safe if already inactive)
  _deactivateToken(targetToken);

  return _json({
    ok: true,
    revoked: true,
    target_token: targetToken,
    target_user_id: targetUserId
  });
}

/* ========= ADMIN: Programs list (for Create User UI) ========= */
/**
 * Admin/moderator-only: list distinct program_ids from program_course_map.
 * Used to populate the Program dropdown on the Create User page.
 */
function apiListPrograms(args){
  var token = args.token || '';
  if(!token) return _json({ok:false, error:'missing_token'});

  var chk = _checkToken(token);
  if(!chk.ok) return _json({ok:false, error:chk.reason || 'invalid_token'});

  var caller = _getUserById(chk.token.user_id);
  if(!caller) return _json({ok:false, error:'caller_missing'});
  if(!_toBool_(caller.active)) return _json({ok:false, error:'caller_inactive'});

  // Any active user can technically see programs, but in practice this is called from admin/mod pages
  var {rows} = _rows(SH_PCMAP);
  var seen = {};
  var out = [];

  rows.forEach(function(r){
    var pid = String(r.program_id || '').trim().toUpperCase();
    if(!pid) return;
    if(seen[pid]) return;
    seen[pid] = true;
    out.push({
      program_id: pid
    });
  });

  return _json({ ok:true, programs: out });
}

/* ========= NEW: Admin search users (for Assign Product, etc.) ========= */
/**
 * Admin-only: search users by free-text query.
 *
 * Input:
 *  - token (admin) [required]
 *  - query [required, min length 2 recommended]
 *  - limit [optional, default 20, max 50]
 *
 * Search logic:
 *  - Looks across: email, username, forename, surname, user_id, program_id, cohort.
 *  - Case-insensitive, "contains" match.
 */
function apiAdminSearchUsers(args){
  var token = args.token || '';
  var query = (args.query || '').trim();
  var limitRaw = parseInt(args.limit, 10);
  var limit = (isNaN(limitRaw) || limitRaw <= 0) ? 20 : limitRaw;
  if(limit > 50) limit = 50;

  if(!token) return _json({ok:false, error:'missing_token'});
  if(!query || query.length < 2){
    return _json({ok:false, error:'missing_or_short_query'});
  }

  // Check caller token & admin role
  var chk = _checkToken(token);
  if(!chk.ok) return _json({ok:false, error:chk.reason || 'invalid_token'});

  var caller = _getUserById(chk.token.user_id);
  if(!caller) return _json({ok:false, error:'caller_missing'});
  if(!_toBool_(caller.active)) return _json({ok:false, error:'caller_inactive'});

  var callerIsAdmin = String(caller.role || '').trim().toUpperCase() === 'ADMIN';
  if(!callerIsAdmin) return _json({ok:false, error:'forbidden'});

  // Load users
  var userData = _rows(SH_USERS);
  var users = userData.rows || [];
  var q = query.toLowerCase();

  var matches = [];
  users.forEach(function(u){
    var hay = [
      u.email,
      u.username,
      u.forename,
      u.surname,
      u.user_id,
      u.program_id,
      u.cohort
    ].map(function(x){ return String(x || ''); }).join(' ').toLowerCase();

    if(hay.indexOf(q) !== -1){
      matches.push({
        user_id:   u.user_id || '',
        email:     u.email || '',
        username:  u.username || '',
        name:      u.name || [u.forename, u.surname].filter(Boolean).join(' '),
        forename:  u.forename || '',
        surname:   u.surname || '',
        program_id:u.program_id || '',
        cohort:    u.cohort || '',
        role:      u.role || '',
        active:    _toBool_(u.active),
        expires_utc: u.expires_utc || ''
      });
    }
  });

  // Sort by name then email for stability
  matches.sort(function(a,b){
    var an = (a.name || '').toLowerCase();
    var bn = (b.name || '').toLowerCase();
    if(an < bn) return -1;
    if(an > bn) return 1;
    var ae = (a.email || '').toLowerCase();
    var be = (b.email || '').toLowerCase();
    if(ae < be) return -1;
    if(ae > be) return 1;
    return 0;
  });

  if(matches.length > limit){
    matches = matches.slice(0, limit);
  }

  return _json({
    ok: true,
    query: query,
    count: matches.length,
    users: matches
  });
}

/* ========= NEW: Admin get user subscriptions ========= */
/**
 * Admin-only: list all subscriptions for a given user.
 *
 * Input:
 *  - token (admin) [required]
 *  - user_id OR email [one required]
 *
 * Behaviour:
 *  - Resolves the user.
 *  - Returns all subscriptions for that user, joined with product metadata.
 *  - Adds derived state flags: is_current, state (ACTIVE/FUTURE/EXPIRED/etc.).
 */
function apiAdminGetUserSubscriptions(args){
  var token    = args.token || '';
  var user_id  = (args.user_id || '').trim();
  var emailRaw = (args.email   || '').trim().toLowerCase();

  if(!token) return _json({ok:false, error:'missing_token'});
  if(!user_id && !emailRaw){
    return _json({ok:false, error:'missing_user_ref'});
  }

  // Check caller token & admin
  var chk = _checkToken(token);
  if(!chk.ok) return _json({ok:false, error:chk.reason || 'invalid_token'});

  var caller = _getUserById(chk.token.user_id);
  if(!caller) return _json({ok:false, error:'caller_missing'});
  if(!_toBool_(caller.active)) return _json({ok:false, error:'caller_inactive'});
  var callerIsAdmin = String(caller.role || '').trim().toUpperCase() === 'ADMIN';
  if(!callerIsAdmin) return _json({ok:false, error:'forbidden'});

  // Resolve target user
  var targetUser = null;
  if(emailRaw){
    targetUser = _getUserByEmail(emailRaw);
  } else if(user_id){
    targetUser = _getUserById(user_id);
  }
  if(!targetUser){
    return _json({ok:false, error:'user_not_found'});
  }

  var resolvedUserId = targetUser.user_id;

  // Load subscriptions + products
  var subsData = _rows(SH_SUBSCRIPTIONS);
  var subsRows = subsData.rows || [];
  var productsData = _rows(SH_PRODUCTS);
  var productRows = productsData.rows || [];

  var productsById = {};
  productRows.forEach(function(p){
    var pid = String(p.product_id || '').trim().toUpperCase();
    if(pid){
      productsById[pid] = p;
    }
  });

  var now = _now();

  var userSubs = subsRows
    .filter(function(r){
      return String(r.user_id || '').trim() === String(resolvedUserId || '').trim();
    })
    .map(function(r){
      var pid = String(r.product_id || '').trim().toUpperCase();
      var product = productsById[pid] || {};
      var start = _parseUtc_(r.start_utc);
      var exp   = _parseUtc_(r.expires_utc);
      var statusRaw = String(r.status || '').trim().toUpperCase();

      var state = 'UNKNOWN';
      if(statusRaw === 'ACTIVE'){
        if(exp && now >= exp){
          state = 'EXPIRED';
        } else if(start && now < start){
          state = 'FUTURE';
        } else {
          state = 'ACTIVE';
        }
      } else if(statusRaw){
        state = statusRaw;
      }

      var isCurrent = (state === 'ACTIVE');

      return {
        subscription_id: r.subscription_id || '',
        product_id:      pid,
        product_name:    product.name || '',
        courses_included: product.courses_included || '',
        start_utc:       r.start_utc || '',
        expires_utc:     r.expires_utc || '',
        status:          statusRaw || '',
        state:           state,
        is_current:      isCurrent
      };
    });

  // Sort subscriptions by start_utc DESC (latest at top)
  userSubs.sort(function(a,b){
    var da = _parseUtc_(a.start_utc) || new Date(0);
    var db = _parseUtc_(b.start_utc) || new Date(0);
    return db - da;
  });

  var userOut = {
    user_id:   targetUser.user_id || '',
    email:     targetUser.email || '',
    username:  targetUser.username || '',
    name:      targetUser.name || [targetUser.forename, targetUser.surname].filter(Boolean).join(' '),
    program_id:targetUser.program_id || '',
    cohort:    targetUser.cohort || ''
  };

  return _json({
    ok: true,
    user: userOut,
    subscriptions: userSubs
  });
}

/**
 * Admin-only: run the subscription expiry reminder scan.
 *
 * Input:
 *  - token (admin) [required]
 *
 * Behaviour:
 *  - Checks admin token.
 *  - Calls _runExpiryReminderScan_([3,1]).
 *  - Returns stats (scanned, sent, sentByDay).
 */
function apiSendExpiryReminders(args) {
  var token = args.token || '';
  if (!token) {
    return _json({ ok:false, error:'missing_token' });
  }

  // Check caller token
  var chk = _checkToken(token);
  if (!chk.ok) {
    return _json({ ok:false, error:chk.reason || 'invalid_token' });
  }

  var caller = _getUserById(chk.token.user_id);
  if (!caller) {
    return _json({ ok:false, error:'caller_missing' });
  }
  if (!_toBool_(caller.active)) {
    return _json({ ok:false, error:'caller_inactive' });
  }

  var roleUpper = String(caller.role || '').trim().toUpperCase();
  var callerIsAdmin = (roleUpper === 'ADMIN');
  if (!callerIsAdmin) {
    return _json({ ok:false, error:'forbidden' });
  }

  // Run the scan via shared core helper
  var res = _runExpiryRemindersCore_();

  return _json({
    ok: true,
    scanned:   res.scanned,
    sent:      res.sent,
    sentByDay: res.sentByDay || {}
  });
}


/**
 * Admin-only: list auth_events for audit.
 *
 * Input (via POST):
 *  - token            (admin's token) [required]
 *  - filter_user_id   [optional] → only events for this user_id
 *  - filter_email     [optional] → match resolved user email OR identifier
 *  - kind             [optional] → e.g. LOGIN_EMAIL, LOGIN_USERNAME, LOGIN_GOOGLE
 *  - only_failed      [optional] → "true"/"1"/"yes" => only ok === false
 *  - since_utc        [optional] → ISO string lower bound on ts_utc
 *  - until_utc        [optional] → ISO string upper bound on ts_utc
 *  - limit            [optional] → max rows (default 200, max 500)
 *
 * Behaviour:
 *  - Requires ADMIN caller.
 *  - Joins auth_events with users to include name, email, program, role.
 *  - Does NOT expose ip_hash or ua_hash (privacy).
 *  - Sorted by ts_utc DESC (most recent first).
 */
function apiAdminListAuthEvents(args) {
  var token          = args.token || '';
  var filter_user_id = (args.filter_user_id || '').trim();
  var filter_email   = (args.filter_email   || '').trim().toLowerCase();
  var kindRaw        = (args.kind           || '').trim();
  var onlyFailed     = _toBool_(args.only_failed);
  var sinceRaw       = (args.since_utc      || '').trim();
  var untilRaw       = (args.until_utc      || '').trim();

  var limitRaw       = parseInt(args.limit, 10);
  var limit          = (isNaN(limitRaw) || limitRaw <= 0) ? 200 : limitRaw;
  if (limit > 500) limit = 500;

  if (!token) return _json({ ok:false, error:'missing_token' });

  // 1) Check caller token & admin role
  var chk = _checkToken(token);
  if (!chk.ok) return _json({ ok:false, error:chk.reason || 'invalid_token' });

  var caller = _getUserById(chk.token.user_id);
  if (!caller) return _json({ ok:false, error:'caller_missing' });
  if (!_toBool_(caller.active)) return _json({ ok:false, error:'caller_inactive' });

  var callerIsAdmin = String(caller.role || '').trim().toUpperCase() === 'ADMIN';
  if (!callerIsAdmin) return _json({ ok:false, error:'forbidden' });

  // 2) Load events + users
  var evData   = _rows(SH_AUTH_EVENTS);
  var evRows   = evData.rows || [];

  var userData = _rows(SH_USERS);
  var users    = userData.rows || [];
  var userById = {};
  users.forEach(function(u) {
    if (u.user_id) {
      userById[String(u.user_id)] = u;
    }
  });

  // 3) Normalise filters
  var kindUpper = kindRaw ? kindRaw.toUpperCase() : '';
  var sinceDate = sinceRaw ? _parseUtc_(sinceRaw) : null;
  var untilDate = untilRaw ? _parseUtc_(untilRaw) : null;

  // 4) Build merged objects and apply filters
  var merged = [];
  evRows.forEach(function(r) {
    var evUserId = String(r.user_id || '').trim();
    var u        = evUserId ? (userById[evUserId] || {}) : {};

    var ts = _parseUtc_(r.ts_utc);
    if (!ts) return; // skip malformed timestamps

    if (sinceDate && ts < sinceDate) return;
    if (untilDate && ts > untilDate) return;

    var okFlag = _toBool_(r.ok);
    if (onlyFailed && okFlag) return;

    var thisKind = String(r.kind || '').trim();
    if (kindUpper && thisKind.toUpperCase() !== kindUpper) return;

    if (filter_user_id && evUserId !== filter_user_id) return;

    if (filter_email) {
      var uEmail = String(u.email || '').trim().toLowerCase();
      var ident  = String(r.identifier || '').trim().toLowerCase();
      if (uEmail !== filter_email && ident !== filter_email) {
        return;
      }
    }

    merged.push({
      event_id:   r.event_id || '',
      ts_utc:     r.ts_utc   || '',
      kind:       thisKind,
      identifier: r.identifier || '',
      ok:         okFlag,
      error_code: r.error_code || '',
      note:       r.note       || '',
      user_id:    evUserId,
      // joined user details
      name:       u.name || [u.forename, u.surname].filter(Boolean).join(' '),
      email:      u.email || '',
      program_id: u.program_id || '',
      role:       u.role || ''
      // ip_hash and ua_hash intentionally not exposed
    });
  });

  // 5) Sort by ts_utc DESC
  merged.sort(function(a, b) {
    var da = _parseUtc_(a.ts_utc) || new Date(0);
    var db = _parseUtc_(b.ts_utc) || new Date(0);
    return db - da;
  });

  // 6) Limit result size
  if (merged.length > limit) {
    merged = merged.slice(0, limit);
  }

  return _json({
    ok: true,
    events: merged
  });
}

/**
 * Admin-only: list password reset requests from SH_RESET.
 *
 * Input:
 *  - token            (admin) [required]
 *  - filter_identifier [optional] → matches identifier_raw (contains, case-insensitive)
 *  - filter_email      [optional] → exact match on email (case-insensitive)
 *  - status            [optional] → e.g. REQUESTED, TOKEN_CREATED, EMAIL_SENT, USED, EXPIRED
 *  - since_utc         [optional] → lower bound on requested_utc
 *  - until_utc         [optional] → upper bound on requested_utc
 *  - limit             [optional] → max rows (default 200, max 500)
 *
 * Behaviour:
 *  - Requires ADMIN caller.
 *  - Does NOT expose reset_token (security).
 *  - ip_hash/ua_hash are returned as-is (already hashed).
 *  - Sorted by requested_utc DESC.
 */
function apiAdminListResetRequests(args) {
  var token            = args.token || '';
  var filterIdentRaw   = (args.filter_identifier || '').trim().toLowerCase();
  var filterEmail      = (args.filter_email     || '').trim().toLowerCase();
  var statusRaw        = (args.status           || '').trim();
  var sinceRaw         = (args.since_utc        || '').trim();
  var untilRaw         = (args.until_utc        || '').trim();

  var limitRaw         = parseInt(args.limit, 10);
  var limit            = (isNaN(limitRaw) || limitRaw <= 0) ? 200 : limitRaw;
  if (limit > 500) limit = 500;

  if (!token) return _json({ ok:false, error:'missing_token' });

  // 1) Check caller token & admin
  var chk = _checkToken(token);
  if (!chk.ok) return _json({ ok:false, error:chk.reason || 'invalid_token' });

  var caller = _getUserById(chk.token.user_id);
  if (!caller) return _json({ ok:false, error:'caller_missing' });
  if (!_toBool_(caller.active)) return _json({ ok:false, error:'caller_inactive' });

  var callerIsAdmin = String(caller.role || '').trim().toUpperCase() === 'ADMIN';
  if (!callerIsAdmin) return _json({ ok:false, error:'forbidden' });

  // 2) Load reset_requests
  var data    = _rows(SH_RESET);
  var rows    = data.rows || [];

  var statusUpper = statusRaw ? statusRaw.toUpperCase() : '';
  var sinceDate   = sinceRaw ? _parseUtc_(sinceRaw) : null;
  var untilDate   = untilRaw ? _parseUtc_(untilRaw) : null;

  var out = [];

  rows.forEach(function(r) {
    var reqTs = _parseUtc_(r.requested_utc);
    if (!reqTs) return;

    if (sinceDate && reqTs < sinceDate) return;
    if (untilDate && reqTs > untilDate) return;

    if (filterIdentRaw) {
      var ident = String(r.identifier_raw || '').trim().toLowerCase();
      if (ident.indexOf(filterIdentRaw) === -1) return;
    }

    if (filterEmail) {
      var em = String(r.email || '').trim().toLowerCase();
      if (em !== filterEmail) return;
    }

    var st = String(r.status || '').trim().toUpperCase();
    if (statusUpper && st !== statusUpper) return;

    // Build safe object (no reset_token)
    out.push({
      request_id:     r.request_id     || '',
      identifier_raw: r.identifier_raw || '',
      email:          r.email          || '',
      username:       r.username       || '',
      requested_utc:  r.requested_utc  || '',
      status:         st,
      action_note:    r.action_note    || '',
      last_check_utc: r.last_check_utc || '',
      used_utc:       r.used_utc       || '',
      ip_hash:        r.ip_hash        || '',
      ua_hash:        r.ua_hash        || '',
      has_token:      !!(r.reset_token)  // boolean flag for your UI
    });
  });

  // Sort by requested_utc DESC
  out.sort(function(a, b) {
    var da = _parseUtc_(a.requested_utc) || new Date(0);
    var db = _parseUtc_(b.requested_utc) || new Date(0);
    return db - da;
  });

  if (out.length > limit) {
    out = out.slice(0, limit);
  }

  return _json({
    ok: true,
    requests: out
  });
}
