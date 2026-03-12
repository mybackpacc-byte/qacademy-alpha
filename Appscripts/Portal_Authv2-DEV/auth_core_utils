
/** ============================================================
 * QAcademy Portal — Auth Core Utils
 * Pure low-level helpers: sheets I/O, time/date, hashing,
 * UUID/token generation, boolean parsing, row conversions.
 * No business logic, no API, no HTTP, no emails.
 * Shared by all other auth modules.
 * ============================================================ */

/*=======auth_core_utils.gs=======*/

/* ========= Utilities ========= */
function _ss() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function _sh(name){ return _ss().getSheetByName(name); }
function _now(){ return new Date(); }
function _iso(d){ return d.toISOString(); }
function _addHours(d,h){ return new Date(d.getTime()+h*3600*1000); }
// Simple day adder for subscriptions
function _addDays(d, days){
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function _headers(sh){ return sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0] || []; }
function _rowToObj(headers, row){ const o={}; headers.forEach((h,i)=>o[h]=row[i]??''); return o; }
function _objToRow(headers, obj){ return headers.map(h => obj[h] ?? ''); }
function _rows(name){
  const sh = _sh(name);
  const vals = sh.getDataRange().getValues();
  const headers = vals.shift() || [];
  return {headers, rows: vals.map(r=>_rowToObj(headers,r)), sh};
}
function _findRowIndexBy(sh, colName, value){
  const headers = _headers(sh);
  const col = headers.indexOf(colName)+1;
  if(col<1) throw new Error(`Column "${colName}" not found in ${sh.getName()}`);
  const last = sh.getLastRow();
  if(last<2) return -1;
  const colVals = sh.getRange(2, col, last-1, 1).getValues();
  const needle = String(value||'').trim().toLowerCase();
  for(let i=0;i<colVals.length;i++){
    if(String(colVals[i][0]).trim().toLowerCase() === needle) return i+2;
  }
  return -1;
}
function _appendObj(sh, headers, obj){ sh.appendRow(_objToRow(headers, obj)); }
function _updateObj(sh, headers, rowIndex, obj){
  sh.getRange(rowIndex,1,1,headers.length).setValues([_objToRow(headers,obj)]);
}

/* ========= Helpers: booleans & time ========= */
function _toBool_(v){
  const s = String(v||'').trim().toLowerCase();
  return s==='true' || s==='1' || s==='yes';
}
// Accepts ISO/RFC3339 or Date; assumes UTC if no timezone suffix
function _parseUtc_(val){
  if (!val) return null;
  if (val instanceof Date) return val;
  let s = String(val).trim();
  if (!s) return null;
  if (!/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) s += 'Z';
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse products.courses_included into a clean list of course_ids.
 * Accepts commas, spaces, or a mix: "GP,RN_MED RN_SURG" → ["GP","RN_MED","RN_SURG"]
 */
function _parseCoursesIncluded_(val){
  if (!val) return [];
  var s = String(val)
    .replace(/\u00A0/g, ' ')   // replace non-breaking spaces with normal spaces
    .trim();
  if (!s) return [];
  return s
    .split(/[\s,]+/)           // split on ANY whitespace or comma
    .map(function(x){ return String(x || '').trim().toUpperCase(); })
    .filter(function(x){ return x.length > 0; });
}

/* ========= Crypto ========= */
function _hashWebSafeSHA256(input){
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
}
function _generateSalt(){ return _hashWebSafeSHA256(Utilities.getUuid()).slice(0,22); }
function _generateToken(){ return _hashWebSafeSHA256(Utilities.getUuid()+_iso(_now())); }

// user_id + temp password helpers
function _generateUserId_(){
  // Short, human-readable user ID: U_ + 10 hex-ish chars
  return 'U_' + Utilities.getUuid().replace(/-/g,'').slice(0,10);
}
function _randomTempPassword_(){
  // Simple but non-terrible temp password: Qa- + 8 chars
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  var out = 'Qa-';
  for (var i=0; i<8; i++){
    out += chars.charAt(Math.floor(Math.random()*chars.length));
  }
  return out;
}


/**
 * NEW: derive a human-readable device label from user agent.
 * e.g. "Android · Chrome", "Windows · Edge", "iOS · Safari"
 */
function _deriveDeviceLabelFromUA_(ua){
  if (!ua) return '';
  ua = String(ua);

  var platform = 'Unknown';
  if (/android/i.test(ua)) platform = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) platform = 'iOS';
  else if (/windows/i.test(ua)) platform = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) platform = 'macOS';
  else if (/linux/i.test(ua)) platform = 'Linux';

  var browser = 'Browser';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';

  return platform + ' · ' + browser;
}



/* ========= JSON response ========= */
function _json(data){
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

