/** ============================================================
 * QAcademy — Teacher Assess WebApp — FILE THREE (Teacher Results) — UPDATED
 * - teacher.results.list     (Marksheet)
 * - teacher.results.summary  (Class summary)
 * - teacher.results.items    (Per-item analysis)
 * - teacher.class.quizzes.list (dropdown helper)
 *
 * Key upgrades (2026-02-27):
 * 1) Summary bug fix (avg/median/pass-rate no longer 0).
 * 2) Summary counts now match Marksheet’s exclusive status logic.
 * 3) Marksheet supports BOTH:
 *    - Class fields (teacher_classes.custom_fields_json → member_fields_json values)
 *    - Quiz fields  (teacher_quizzes.custom_fields_json → headline attempt’s candidate_fields_json/custom_fields_json)
 *    Returned as: class_fields[], quiz_fields[], and each row includes headline_fields/headline_fields_json.
 *
 * Uses existing globals/helpers from File 1/2:
 * - DB_ID, SH_ATTEMPTS, SH_CLASS_MEMBERS, SH_TEACHER_QUIZZES, SH_CLASSES, SH_QUIZ_ITEMS, SH_QUIZ_CLASSES
 * - _requireTeacher_, _getTeacherQuizById_, _getClassById_, _getQuizItemsSnapshots_
 * - _normalizeGradingConfig_, _gradeLabelFromBands_
 * - _schemaToFields_, _computeOpenState_, _normalizeResultsPolicy_, _getShowResultsBool_, _toBoolDefault_
 * - _getHeaders_, _rowToObj_, _indexMap_, _parseJsonSafe_, _toIntDefault_, _parseIsoMs_, _iso, _json
 * ============================================================ */

const RESULTS_BUILD = 'teacherassess-results-v0.2-2026-02-27';

// ------------------------------
// Public Handlers
// ------------------------------

/**
 * teacher.results.list (Marksheet)
 * Required:
 * - teacher_quiz_id
 * - class_id
 * Optional:
 * - include_removed=1   (include REMOVED members)
 * - limit (1..500), cursor (offset)
 * - sort: "name_asc"|"score_desc"|"score_asc"|"status_asc"
 */
function _handleTeacherResultsList_({ token, body, p }) {
  const gate = _requireTeacher_({ token });
  if (!gate.ok) return _json(gate.payload, gate.code);

  const teacher_id = gate.teacher_id;
  const getS = (k) => String(((p && p[k]) || (body && body[k]) || '')).trim();

  const teacher_quiz_id = getS('teacher_quiz_id');
  const class_id = getS('class_id');
  if (!teacher_quiz_id) return _json({ ok:false, error:'missing_teacher_quiz_id' }, 400);
  if (!class_id) return _json({ ok:false, error:'missing_class_id' }, 400);

  const include_removed = (getS('include_removed') === '1');

  const limitRaw = _toIntDefault_(getS('limit'), 200);
  const limit = Math.min(Math.max(limitRaw, 1), 500);

  const cursorRaw = _toIntDefault_(getS('cursor'), 0);
  const cursor = Math.max(cursorRaw, 0);

  const sort = (getS('sort') || 'name_asc').trim().toLowerCase();

  const status_filter = (getS('status') || 'ANY').trim().toUpperCase(); // ANY|SUBMITTED|IN_PROGRESS|NOT_STARTED
const date_from = getS('date_from'); // optional ISO
const date_to   = getS('date_to');   // optional ISO

const fromMs = _parseIsoMs_(date_from);
const toMs   = _parseIsoMs_(date_to);

  const ss = SpreadsheetApp.openById(DB_ID);

  // Ownership gates (teacher owns quiz + class)
  const q = _getTeacherQuizById_(teacher_quiz_id);
  if (!q.found) return _json({ ok:false, error:'quiz_not_found' }, 404);
  if (q.teacher_id !== teacher_id) return _json({ ok:false, error:'forbidden' }, 403);

  const c = _getClassById_(class_id);
  if (!c.found) return _json({ ok:false, error:'class_not_found' }, 404);
  if (c.teacher_id !== teacher_id) return _json({ ok:false, error:'forbidden' }, 403);

  const quiz = q.obj || {};
  const cls = c.obj || {};

  const preset = String(quiz.preset || '').trim().toUpperCase();
  const headline_rule = _headlineRuleFromPreset_(preset);

  // grading config (from quiz)
  const gc = _normalizeGradingConfig_(quiz);
  const passMin = _coercePassThreshold_(gc);

  // --- Schemas (ordered + labeled)
  const classSchemaStr = String(cls.custom_fields_json || '').trim() || JSON.stringify({ fields: [] });
  const quizSchemaStr  = String(quiz.custom_fields_json || '').trim() || JSON.stringify({ fields: [] });

  const class_fields = _schemaToFields_(classSchemaStr); // [{key,label,required,type,options}]
  const quiz_fields  = _schemaToFields_(quizSchemaStr);

  // 1) roster (display_name + member_fields_json are REQUIRED in output)
  const rosterPack = _loadClassRoster_(ss, class_id, { include_removed });
  const roster = rosterPack.items;

  // 2) attempts grouped by user_id (includes candidate/custom fields)
const attemptsPack = _loadAttemptsForQuizClass_(ss, teacher_id, teacher_quiz_id, class_id, { fromMs, toMs });
const byUserAttempts = attemptsPack.byUserId;

  // 3) build marksheet rows (one row per roster student)
  let rows = [];

  for (let i = 0; i < roster.length; i++) {
    const m = roster[i];
    const user_id = String(m.user_id || '').trim();
    const attempts = byUserAttempts[user_id] || [];

const s = _computeStudentResultRow_({
  member: m,
  attempts,
  headline_rule,
  grade_bands: gc.grade_bands,
  quiz_fields: quiz_fields,
  pass_threshold_pct: passMin
});

    rows.push(s);
  }

  // 4) sort
  rows.sort(_makeMarksheetSorter_(sort));
 
   if (status_filter && status_filter !== 'ANY') {
  rows = rows.filter(r => String(r.status || '').toUpperCase() === status_filter);
}
  // 5) paginate
  const sliced = rows.slice(cursor, cursor + limit);
  const next_cursor = (cursor + limit < rows.length) ? String(cursor + limit) : '';

  return _json({
    ok: true,
    build: RESULTS_BUILD,
    quiz: {
      teacher_quiz_id: String(quiz.teacher_quiz_id || '').trim(),
      title: String(quiz.title || '').trim(),
      preset: preset,

      grading_policy: gc.grading_policy,
      grade_bands_json: gc.grade_bands_json,
      score_display_policy: gc.score_display_policy,
      pass_threshold_pct: String(passMin),

      // quiz schema used for quiz_fields
      custom_fields_json: String(quiz.custom_fields_json || '').trim() || JSON.stringify({ fields: [] })
    },
    class: {
      class_id: String(cls.class_id || '').trim(),
      title: String(cls.title || '').trim(),
      status: String(cls.status || '').trim(),
      // class schema used for class_fields
      custom_fields_json: classSchemaStr
    },

    headline_rule,

    // NEW: labeled schemas for frontend columns
    class_fields,
    quiz_fields,

    roster_total: rows.length,
    count: sliced.length,
    cursor: String(cursor),
    next_cursor,
    rows: sliced
  });
}

/**
 * teacher.results.summary (Class summary)
 * Required:
 * - teacher_quiz_id
 * - class_id
 * Optional:
 * - include_removed=1
 */
function _handleTeacherResultsSummary_({ token, body, p }) {
  const gate = _requireTeacher_({ token });
  if (!gate.ok) return _json(gate.payload, gate.code);

  const teacher_id = gate.teacher_id;
  const getS = (k) => String(((p && p[k]) || (body && body[k]) || '')).trim();

  const teacher_quiz_id = getS('teacher_quiz_id');
  const class_id = getS('class_id');
  if (!teacher_quiz_id) return _json({ ok:false, error:'missing_teacher_quiz_id' }, 400);
  if (!class_id) return _json({ ok:false, error:'missing_class_id' }, 400);

  const include_removed = (getS('include_removed') === '1');
  const date_from = getS('date_from'); // optional ISO
const date_to   = getS('date_to');   // optional ISO

const fromMs = _parseIsoMs_(date_from);
const toMs   = _parseIsoMs_(date_to);

  const ss = SpreadsheetApp.openById(DB_ID);

  // Ownership gates
  const q = _getTeacherQuizById_(teacher_quiz_id);
  if (!q.found) return _json({ ok:false, error:'quiz_not_found' }, 404);
  if (q.teacher_id !== teacher_id) return _json({ ok:false, error:'forbidden' }, 403);

  const c = _getClassById_(class_id);
  if (!c.found) return _json({ ok:false, error:'class_not_found' }, 404);
  if (c.teacher_id !== teacher_id) return _json({ ok:false, error:'forbidden' }, 403);

  const quiz = q.obj || {};
  const preset = String(quiz.preset || '').trim().toUpperCase();
  const headline_rule = _headlineRuleFromPreset_(preset);

  const gc = _normalizeGradingConfig_(quiz);

  // roster
  const rosterPack = _loadClassRoster_(ss, class_id, { include_removed });
  const roster = rosterPack.items;

  // attempts grouped
const attemptsPack = _loadAttemptsForQuizClass_(ss, teacher_id, teacher_quiz_id, class_id, { fromMs, toMs });
  const byUserAttempts = attemptsPack.byUserId;

  // compute headline per student + summary counts (MATCH Marksheet logic)
  let roster_total = roster.length;
  let not_started = 0;
  let in_progress = 0;
  let submitted = 0;

  const headlinePcts = [];
  const headlineTimes = [];

  // Grade distribution by label
  const dist = {}; // label -> count

// Pass threshold comes from quiz (normalized), fallback only if missing
const passMin = _coercePassThreshold_(gc);

  for (let i = 0; i < roster.length; i++) {
    const user_id = String(roster[i].user_id || '').trim();
    const attempts = byUserAttempts[user_id] || [];

    // Use SAME row computation as marksheet => counts align
    const row = _computeStudentResultRow_({
      member: roster[i],
      attempts,
      headline_rule,
      grade_bands: gc.grade_bands,
      quiz_fields: [] // not needed for summary
    });

    if (row.status === 'NOT_STARTED') not_started++;
    else if (row.status === 'IN_PROGRESS') in_progress++;
    else if (row.status === 'SUBMITTED') submitted++;

    // headline numeric stats
    if (row.headline_score && row.headline_score.percent != null && isFinite(Number(row.headline_score.percent))) {
      const pct = Number(row.headline_score.percent);
      headlinePcts.push(pct);

      // grade distribution
      const label = String(row.grade_label || '').trim();
      if (label) dist[label] = (dist[label] || 0) + 1;
    }

    if (row.time_taken_s != null && String(row.time_taken_s).trim() !== '') {
      const t = _toIntDefault_(row.time_taken_s, null);
      if (t != null && isFinite(t)) headlineTimes.push(t);
    }
  }

  // stats
  const avg_pct = _avg_(headlinePcts);
  const median_pct = _median_(headlinePcts);

  const avg_time_s = _avg_(headlineTimes);
  const median_time_s = _median_(headlineTimes);

  // pass rate (only among students with headline pct)
  const passCount = headlinePcts.filter(x => x >= passMin).length;
  const pass_rate_pct = headlinePcts.length ? Math.round((passCount / headlinePcts.length) * 100) : 0;

  return _json({
    ok: true,
    build: RESULTS_BUILD,
    teacher_quiz_id,
    class_id,
    headline_rule,

    roster_total,
    not_started_count: not_started,
    in_progress_count: in_progress,
    submitted_count: submitted,

    avg_pct,
    median_pct,
    pass_threshold_pct: passMin,
    pass_rate_pct,

    grade_distribution: dist,

    avg_time_s,
    median_time_s
  });
}

/**
 * teacher.results.items (Per-item analysis)
 * Required:
 * - teacher_quiz_id
 * - class_id
 * Optional:
 * - attempt_limit (cap scanned attempts; default 2000; max 10000)
 * - include_timed_out=1 (default yes)
 */
function _handleTeacherResultsItems_({ token, body, p }) {
  const gate = _requireTeacher_({ token });
  if (!gate.ok) return _json(gate.payload, gate.code);

  const teacher_id = gate.teacher_id;
  const getS = (k) => String(((p && p[k]) || (body && body[k]) || '')).trim();

  const teacher_quiz_id = getS('teacher_quiz_id');
  const class_id = getS('class_id');
  if (!teacher_quiz_id) return _json({ ok:false, error:'missing_teacher_quiz_id' }, 400);
  if (!class_id) return _json({ ok:false, error:'missing_class_id' }, 400);

  const attemptLimitRaw = _toIntDefault_(getS('attempt_limit'), 2000);
  const attempt_limit = Math.min(Math.max(attemptLimitRaw, 50), 10000);

  const include_timed_out = (getS('include_timed_out') !== '0'); // default true

  const ss = SpreadsheetApp.openById(DB_ID);

  // Ownership gates
  const q = _getTeacherQuizById_(teacher_quiz_id);
  if (!q.found) return _json({ ok:false, error:'quiz_not_found' }, 404);
  if (q.teacher_id !== teacher_id) return _json({ ok:false, error:'forbidden' }, 403);

  const c = _getClassById_(class_id);
  if (!c.found) return _json({ ok:false, error:'class_not_found' }, 404);
  if (c.teacher_id !== teacher_id) return _json({ ok:false, error:'forbidden' }, 403);

  // snapshots
  const snaps = _getQuizItemsSnapshots_(ss, teacher_quiz_id);
  if (!snaps.length) return _json({ ok:false, error:'quiz_has_no_snapshots' }, 400);

  // init stats per item
  const itemStats = {}; // quiz_item_id -> stats

  for (let i = 0; i < snaps.length; i++) {
    const s = snaps[i] || {};
    const id = String(s.quiz_item_id || '').trim();
    if (!id) continue;

    const correct = String(s.snap_correct || '').trim().toUpperCase();
    const marks = _toIntDefault_(s.snap_marks, 1);
    const topic = String(s.snap_topic || '').trim();

    itemStats[id] = {
      quiz_item_id: id,
      position: String(s.position || '').trim(),
      topic,
      marks: String(marks),
      correct,

      attempts: 0,
      correct_count: 0,
      wrong_count: 0,
      blank_count: 0,

      option_counts: { A:0,B:0,C:0,D:0,E:0,F:0 },

      stem_preview: _preview_(String(s.snap_stem || '').trim(), 110)
    };
  }

  // scan attempts
  const sh = ss.getSheetByName(SH_ATTEMPTS);
  if (!sh) return _json({ ok:false, error:'missing_tab', tab: SH_ATTEMPTS }, 500);

  const headers = _getHeaders_(sh);

  const idx = _indexMap_(headers, [
    'attempt_id','teacher_id','teacher_quiz_id','class_id','status',
    'items_json','answers_json'
  ]);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    return _json({ ok:true, teacher_quiz_id, class_id, count:0, items:[], topic_summary:[], scanned_attempts:0, truncated:false });
  }

  const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  let scanned = 0;
  let truncated = false;

  // scan from bottom up (newest first) but still counts aggregated (cap by attempt_limit)
  for (let r = values.length - 1; r >= 0; r--) {
    if (scanned >= attempt_limit) { truncated = true; break; }

    const row = values[r];

    if (String(row[idx.teacher_id] || '').trim() !== teacher_id) continue;
    if (String(row[idx.teacher_quiz_id] || '').trim() !== teacher_quiz_id) continue;
    if (String(row[idx.class_id] || '').trim() !== class_id) continue;

    const st = String(row[idx.status] || '').trim().toUpperCase();
    if (!st || st === 'ABANDONED' || st === 'IN_PROGRESS') continue;
    if (!include_timed_out && st === 'TIMED_OUT') continue;

    scanned++;

    const itemsArr = _parseJsonSafe_(String(row[idx.items_json] || '').trim(), []) || [];
    const answers = _parseJsonSafe_(String(row[idx.answers_json] || '').trim(), {}) || {};

    for (let i = 0; i < itemsArr.length; i++) {
      const ai = itemsArr[i] || {};
      const qid = String(ai.quiz_item_id || '').trim();
      if (!qid || !itemStats[qid]) continue;

      const stat = itemStats[qid];
      stat.attempts++;

      const opt_map = (ai.opt_map && typeof ai.opt_map === 'object') ? ai.opt_map : {};
      const chosenDisplay = String(answers[qid] || '').trim().toUpperCase();

      if (!chosenDisplay) {
        stat.blank_count++;
        continue;
      }

      const chosenCanon = String(opt_map[chosenDisplay] || '').trim().toUpperCase();
      if (!chosenCanon || !stat.option_counts.hasOwnProperty(chosenCanon)) {
        stat.blank_count++;
        continue;
      }

      stat.option_counts[chosenCanon]++;

      if (chosenCanon === stat.correct) {
        stat.correct_count++;
      } else {
        stat.wrong_count++;
      }
    }
  }

  // finalize: pct, distractors, flags, topic summary
  const itemsOut = [];
  const topicAgg = {}; // topic -> {attempts, correct}

  Object.keys(itemStats).forEach(qid => {
    const s = itemStats[qid];
    const attempts = s.attempts || 0;

    const pct_correct = attempts ? Math.round((s.correct_count / attempts) * 100) : 0;

    // common distractor
    let bestWrongOpt = '';
    let bestWrongCount = 0;

    ['A','B','C','D','E','F'].forEach(L => {
      if (L === s.correct) return;
      const c = s.option_counts[L] || 0;
      if (c > bestWrongCount) {
        bestWrongCount = c;
        bestWrongOpt = L;
      }
    });

    const common_distractor = bestWrongOpt
      ? { option: bestWrongOpt, count: bestWrongCount, pct: attempts ? Math.round((bestWrongCount / attempts) * 100) : 0 }
      : null;

    // flags (simple, teacher-friendly)
    const flags = [];
    if (attempts >= 5) {
      if (pct_correct >= 90) flags.push('TOO_EASY');
      if (pct_correct <= 30) flags.push('TOO_HARD');

      const blankRate = attempts ? (s.blank_count / attempts) : 0;
      if (blankRate >= 0.20) flags.push('HIGH_BLANKS');

      if (bestWrongCount > s.correct_count) flags.push('DISTRACTOR_DOMINANT');
    }

    // topic aggregation
    const topic = String(s.topic || '').trim() || 'Untitled';
    if (!topicAgg[topic]) topicAgg[topic] = { topic, attempts:0, correct:0 };
    topicAgg[topic].attempts += attempts;
    topicAgg[topic].correct += (s.correct_count || 0);

    itemsOut.push({
      quiz_item_id: s.quiz_item_id,
      position: s.position || '',
      topic: s.topic || '',
      marks: s.marks || '1',
      correct: s.correct || '',
      attempts,
      correct_count: s.correct_count,
      wrong_count: s.wrong_count,
      blank_count: s.blank_count,
      pct_correct,
      option_counts: s.option_counts,
      common_distractor,
      flags,
      stem_preview: s.stem_preview || ''
    });
  });

  // sort by position numeric
  itemsOut.sort((a,b) => _toIntDefault_(a.position, 0) - _toIntDefault_(b.position, 0));

  // topic summary output
  const topic_summary = Object.keys(topicAgg).map(k => {
    const t = topicAgg[k];
    const pct = t.attempts ? Math.round((t.correct / t.attempts) * 100) : 0;
    return { topic: t.topic, attempts: t.attempts, pct_correct: pct };
  }).sort((a,b) => (b.attempts || 0) - (a.attempts || 0));

  return _json({
    ok: true,
    build: RESULTS_BUILD,
    teacher_quiz_id,
    class_id,
    scanned_attempts: scanned,
    truncated,
    count: itemsOut.length,
    items: itemsOut,
    topic_summary
  });
}

/**
 * teacher.class.quizzes.list
 * (dropdown helper for Results)
 */
function _handleTeacherClassQuizzesList_({ token, body, p }) {
  const gate = _requireTeacher_({ token });
  if (!gate.ok) return _json(gate.payload, gate.code);

  const teacher_id = gate.teacher_id;
  const getS = (k) => String(((p && p[k]) || (body && body[k]) || '')).trim();

  const class_id = getS('class_id');
  if (!class_id) return _json({ ok:false, error:'missing_class_id' }, 400);

  // ownership gate via teacher_classes
  const cls = _getClassById_(class_id);
  if (!cls.found) return _json({ ok:false, error:'class_not_found' }, 404);
  if (cls.teacher_id !== teacher_id) return _json({ ok:false, error:'forbidden' }, 403);

  const statusWant = (getS('status') || 'PUBLISHED').toUpperCase(); // PUBLISHED|ANY
  const nowMs = Date.now();

  const ss = SpreadsheetApp.openById(DB_ID);

  // 1) Collect linked quiz ids from teacher_quiz_classes (ACTIVE only)
  const mapSh = ss.getSheetByName(SH_QUIZ_CLASSES);
  const mh = _getHeaders_(mapSh);
  const midx = _indexMap_(mh, ['teacher_quiz_id','class_id','teacher_id','status']);

  const mapLast = mapSh.getLastRow();
  const mapVals = (mapLast >= 2) ? mapSh.getRange(2,1,mapLast-1,mapSh.getLastColumn()).getValues() : [];

  const quizSet = {};
  for (let i=0;i<mapVals.length;i++){
    const r = mapVals[i];
    if (String(r[midx.teacher_id]||'').trim() !== teacher_id) continue;
    if (String(r[midx.class_id]||'').trim() !== class_id) continue;

    const st = String(r[midx.status]||'').trim().toUpperCase() || 'ACTIVE';
    if (st !== 'ACTIVE') continue;

    const qid = String(r[midx.teacher_quiz_id]||'').trim();
    if (qid) quizSet[qid] = true;
  }

  const quizIds = Object.keys(quizSet);
  if (!quizIds.length) return _json({ ok:true, class_id, count:0, items:[] });

  // 2) Load quiz rows from teacher_quizzes for those ids
  const qSh = ss.getSheetByName(SH_TEACHER_QUIZZES);
  const qh = _getHeaders_(qSh);
  const qLast = qSh.getLastRow();
  const qVals = (qLast >= 2) ? qSh.getRange(2,1,qLast-1,qSh.getLastColumn()).getValues() : [];

  const items = [];
  for (let i=0;i<qVals.length;i++){
    const q = _rowToObj_(qh, qVals[i]);
    if (String(q.teacher_id||'').trim() !== teacher_id) continue;

    const qid = String(q.teacher_quiz_id||'').trim();
    if (!quizSet[qid]) continue;

    const st = String(q.status||'').trim().toUpperCase();
    if (statusWant !== 'ANY' && st !== statusWant) continue;

    items.push({
      teacher_quiz_id: qid,
      title: String(q.title||'').trim(),
      subject: String(q.subject||'').trim(),
      status: st,
      open_at: String(q.open_at||'').trim(),
      close_at: String(q.close_at||'').trim(),
      open_state: _computeOpenState_(q.open_at, q.close_at, nowMs),
      updated_at: String(q.updated_at||'').trim(),

      preset: String(q.preset||'').trim().toUpperCase(),
      results_release_policy: _normalizeResultsPolicy_(q.results_release_policy),
      show_results: _getShowResultsBool_(q),
      show_review: _toBoolDefault_(q.show_review, true),
      max_attempts: String(_toIntDefault_(q.max_attempts, 0)),
      duration_minutes: String(_toIntDefault_(q.duration_minutes, 0))
    });
  }

  items.sort((a,b)=> (_parseIsoMs_(b.updated_at)||0) - (_parseIsoMs_(a.updated_at)||0));

  return _json({ ok:true, class_id, count: items.length, items });
}

// ------------------------------
// Helpers (File 3-local)
// ------------------------------

function _headlineRuleFromPreset_(presetUpper) {
  const p = String(presetUpper || '').trim().toUpperCase();
  if (p === 'EXAM') return 'FIRST';
  if (p === 'IN_CLASS') return 'LATEST';
  if (p === 'ASSIGNMENT') return 'BEST';
  if (p === 'STUDY') return 'BEST';
  return 'LATEST';
}

function _isEndedStatus_(st) {
  const s = String(st || '').trim().toUpperCase();
  return (s && s !== 'IN_PROGRESS' && s !== 'ABANDONED');
}

function _attemptMs_(a) {
  return (
    _parseIsoMs_(String(a.submitted_at || '').trim()) ||
    _parseIsoMs_(String(a.updated_at || '').trim()) ||
    _parseIsoMs_(String(a.started_at || '').trim()) ||
    0
  );
}

function _parseScoreObj_(a) {
  // prefer score_json; fallback to columns if present
  let sj = _parseJsonSafe_(String(a.score_json || '').trim(), null);
  if (sj && typeof sj === 'object') {
    const percent = (sj.percent != null) ? Number(sj.percent) : null;
    const score_marks = (sj.score_marks != null) ? Number(sj.score_marks) : null;
    const total_marks = (sj.total_marks != null) ? Number(sj.total_marks) : null;
    return {
      percent: (percent == null || !isFinite(percent)) ? null : percent,
      score_marks: (score_marks == null || !isFinite(score_marks)) ? null : score_marks,
      total_marks: (total_marks == null || !isFinite(total_marks)) ? null : total_marks
    };
  }

  // fallback: score_pct/raw/total columns
  const pct = Number(String(a.score_pct || '').trim());
  const raw = Number(String(a.score_raw || '').trim());
  const tot = Number(String(a.score_total || '').trim());

  return {
    percent: isFinite(pct) ? pct : null,
    score_marks: isFinite(raw) ? raw : null,
    total_marks: isFinite(tot) ? tot : null
  };
}

// Parse attempt-level quiz custom fields (headline attempt only)
function _parseAttemptFieldsPack_(attemptObj) {
  const a = attemptObj || {};
  const raw =
    String(a.candidate_fields_json || '').trim() ||
    String(a.custom_fields_json || '').trim() ||
    '';

  if (!raw) return { json:'', fields:{} };

  const obj = _parseJsonSafe_(raw, null);
  let fields = {};

  // accept {fields:{...}} or direct map
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    if (obj.fields && typeof obj.fields === 'object' && !Array.isArray(obj.fields)) fields = obj.fields;
    else fields = obj;
  }

  // normalize to strings
  const out = {};
  Object.keys(fields || {}).forEach(k => {
    const kk = String(k || '').trim();
    if (!kk) return;
    out[kk] = String(fields[kk] == null ? '' : fields[kk]).trim();
  });

  return { json: raw, fields: out };
}

function _computeHeadlineFromAttempts_(attempts, rule) {
  const all = (attempts || []).slice();
  const ended = all.filter(a => _isEndedStatus_(a.status));

  const out = {
    headline: null,
    headline_attempt_id: '',
    latest_attempt_id: '',
    in_progress_attempt_id: ''
  };

  if (!all.length) return out;

  // latest attempt id (by timestamp)
  let latest = null;
  let latestMs = -1;

  // in-progress newest
  let inprog = null;
  let inprogMs = -1;

  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    const ms = _attemptMs_(a);
    if (ms > latestMs) { latestMs = ms; latest = a; }
    if (String(a.status || '').toUpperCase() === 'IN_PROGRESS') {
      if (ms > inprogMs) { inprogMs = ms; inprog = a; }
    }
  }

  out.latest_attempt_id = latest ? String(latest.attempt_id || '').trim() : '';
  out.in_progress_attempt_id = inprog ? String(inprog.attempt_id || '').trim() : '';

  if (!ended.length) {
    out.headline = null;
    out.headline_attempt_id = '';
    return out;
  }

  const r = String(rule || 'LATEST').trim().toUpperCase();

  if (r === 'FIRST') {
    // lowest attempt_no, tie by earliest time
    let best = ended[0];
    let bestNo = _toIntDefault_(best.attempt_no, 999999);
    let bestMs2 = _attemptMs_(best);

    for (let i = 1; i < ended.length; i++) {
      const a = ended[i];
      const n = _toIntDefault_(a.attempt_no, 999999);
      const ms = _attemptMs_(a);
      if (n < bestNo || (n === bestNo && ms < bestMs2)) {
        best = a; bestNo = n; bestMs2 = ms;
      }
    }
    out.headline = best;
    out.headline_attempt_id = String(best.attempt_id || '').trim();
    return out;
  }

  if (r === 'BEST') {
    // highest percent, tie by latest time
    let best = ended[0];
    let bestScore = _parseScoreObj_(best);
    let bestPct = (bestScore && bestScore.percent != null) ? bestScore.percent : -1;
    let bestMs2 = _attemptMs_(best);

    for (let i = 1; i < ended.length; i++) {
      const a = ended[i];
      const s = _parseScoreObj_(a);
      const pct = (s && s.percent != null) ? s.percent : -1;
      const ms = _attemptMs_(a);

      if (pct > bestPct || (pct === bestPct && ms > bestMs2)) {
        best = a; bestPct = pct; bestMs2 = ms;
      }
    }
    out.headline = best;
    out.headline_attempt_id = String(best.attempt_id || '').trim();
    return out;
  }

  // LATEST (default)
  let best = ended[0];
  let bestMs2 = _attemptMs_(best);
  for (let i = 1; i < ended.length; i++) {
    const a = ended[i];
    const ms = _attemptMs_(a);
    if (ms > bestMs2) { best = a; bestMs2 = ms; }
  }
  out.headline = best;
  out.headline_attempt_id = String(best.attempt_id || '').trim();
  return out;
}

function _computeStudentResultRow_({ member, attempts, headline_rule, grade_bands, quiz_fields, pass_threshold_pct }) {
const m = member || {};
  const user_id = String(m.user_id || '').trim();

  const computed = _computeHeadlineFromAttempts_(attempts || [], headline_rule);

  const attempts_used = (attempts || []).filter(a => String(a.status || '').toUpperCase() !== 'ABANDONED').length;

  const hasInProgress = (attempts || []).some(a => String(a.status || '').toUpperCase() === 'IN_PROGRESS');
  const hasEnded = (attempts || []).some(a => _isEndedStatus_(a.status));

  // Exclusive status (the one teachers expect)
  let status = 'NOT_STARTED';
  if (attempts_used > 0 && hasInProgress) status = 'IN_PROGRESS';
  else if (attempts_used > 0 && hasEnded) status = 'SUBMITTED';

  // headline score + grade + quiz-fields (from headline attempt only)
let headline_score = null;
let grade_label = '';
let pass_fail = '';
let time_taken_s = '';
  let submitted_at = '';
  let headline_fields_json = '';
  let headline_fields = {};

  if (computed.headline) {
    const s = _parseScoreObj_(computed.headline);
    headline_score = {
      percent: s.percent,
      score_marks: s.score_marks,
      total_marks: s.total_marks
    };

if (s.percent != null && isFinite(Number(s.percent))) {
  const pct = Number(s.percent);
  grade_label = _gradeLabelFromBands_(grade_bands, pct) || '';

  const thr = isFinite(Number(pass_threshold_pct)) ? Number(pass_threshold_pct) : 50;
  pass_fail = (pct >= thr) ? 'PASS' : 'FAIL';
}

    time_taken_s = String(computed.headline.time_taken_s || '').trim();
    submitted_at = String(computed.headline.submitted_at || '').trim();

    const fp = _parseAttemptFieldsPack_(computed.headline);
    headline_fields_json = fp.json || '';
    headline_fields = fp.fields || {};

    // optional: keep only schema keys (prevents random noise keys)
    if (quiz_fields && quiz_fields.length) {
      const keep = {};
      for (let i = 0; i < quiz_fields.length; i++) {
        const k = String(quiz_fields[i].key || '').trim();
        if (!k) continue;
        keep[k] = headline_fields[k] || '';
      }
      headline_fields = keep;
    }
  }

  // last activity timestamp (string)
  let last_activity_at = '';
  if ((attempts || []).length) {
    let best = attempts[0];
    let bestMs = _attemptMs_(best);
    for (let i = 1; i < attempts.length; i++) {
      const ms = _attemptMs_(attempts[i]);
      if (ms > bestMs) { best = attempts[i]; bestMs = ms; }
    }
    last_activity_at =
      String(best.submitted_at || '').trim() ||
      String(best.updated_at || '').trim() ||
      String(best.started_at || '').trim() ||
      '';
  }

  return {
    user_id,

    // roster identifiers
    display_name: String(m.display_name || '').trim(),
    member_fields_json: String(m.member_fields_json || '').trim(),
    member_fields: (m.member_fields && typeof m.member_fields === 'object') ? m.member_fields : {},

    status,
    attempts_used: attempts_used,

    headline_attempt_id: computed.headline_attempt_id || '',
    latest_attempt_id: computed.latest_attempt_id || '',
    in_progress_attempt_id: computed.in_progress_attempt_id || '',

   headline_score,
grade_label,
pass_fail,

    time_taken_s,
    submitted_at,
    last_activity_at,

    // NEW: quiz custom fields from headline attempt
    headline_fields_json,
    headline_fields
  };
}

function _makeMarksheetSorter_(sortKey) {
  const s = String(sortKey || '').trim().toLowerCase();

  if (s === 'score_desc') {
    return (a,b) => {
      const ap = (a.headline_score && a.headline_score.percent != null) ? Number(a.headline_score.percent) : -1;
      const bp = (b.headline_score && b.headline_score.percent != null) ? Number(b.headline_score.percent) : -1;
      if (bp !== ap) return bp - ap;
      return String(a.display_name || '').localeCompare(String(b.display_name || ''), undefined, { sensitivity:'base' });
    };
  }

  if (s === 'score_asc') {
    return (a,b) => {
      const ap = (a.headline_score && a.headline_score.percent != null) ? Number(a.headline_score.percent) : 999999;
      const bp = (b.headline_score && b.headline_score.percent != null) ? Number(b.headline_score.percent) : 999999;
      if (ap !== bp) return ap - bp;
      return String(a.display_name || '').localeCompare(String(b.display_name || ''), undefined, { sensitivity:'base' });
    };
  }

  if (s === 'status_asc') {
    const order = { 'SUBMITTED':0, 'IN_PROGRESS':1, 'NOT_STARTED':2 };
    return (a,b) => {
      const ao = (a.status in order) ? order[a.status] : 9;
      const bo = (b.status in order) ? order[b.status] : 9;
      if (ao !== bo) return ao - bo;
      return String(a.display_name || '').localeCompare(String(b.display_name || ''), undefined, { sensitivity:'base' });
    };
  }

  return (a,b) => String(a.display_name || '').localeCompare(String(b.display_name || ''), undefined, { sensitivity:'base' });
}

/**
 * Loads ACTIVE roster for a class from teacher_class_members.
 * Always returns display_name + member_fields_json (and parsed member_fields).
 */
function _loadClassRoster_(ss, class_id, { include_removed }) {
  const sh = ss.getSheetByName(SH_CLASS_MEMBERS);
  if (!sh) throw new Error('missing_tab:' + SH_CLASS_MEMBERS);

  const headers = _getHeaders_(sh);

  const idx = _indexMap_(headers, [
    'class_id','user_id','display_name','member_fields_json','status','updated_at','joined_at'
  ]);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { items: [], byUserId: {} };

  const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  const items = [];
  const byUserId = {};

  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (String(r[idx.class_id] || '').trim() !== String(class_id).trim()) continue;

    const st = String(r[idx.status] || '').trim().toUpperCase() || 'ACTIVE';
    if (!include_removed && st !== 'ACTIVE') continue;

    const user_id = String(r[idx.user_id] || '').trim();
    if (!user_id) continue;

    const mfJson = String(r[idx.member_fields_json] || '').trim();
    const mfObj = _parseJsonSafe_(mfJson, { fields:{} });
    const mf = (mfObj && mfObj.fields && typeof mfObj.fields === 'object') ? mfObj.fields : {};

    const obj = {
      class_id: String(class_id).trim(),
      user_id,
      display_name: String(r[idx.display_name] || '').trim(),
      member_fields_json: mfJson,
      member_fields: mf,
      status: st,
      joined_at: String(r[idx.joined_at] || '').trim(),
      updated_at: String(r[idx.updated_at] || '').trim()
    };

    items.push(obj);
    byUserId[user_id] = obj;
  }

  items.sort((a,b) => String(a.display_name||'').localeCompare(String(b.display_name||''), undefined, { sensitivity:'base' }));

  return { items, byUserId };
}

/**
 * Loads attempts for (teacher_quiz_id, class_id) and groups by user_id.
 * Includes attempt-level quiz custom fields:
 * - candidate_fields_json (preferred)
 * - custom_fields_json (fallback)
 */
function _loadAttemptsForQuizClass_(ss, teacher_id, teacher_quiz_id, class_id) {
  const sh = ss.getSheetByName(SH_ATTEMPTS);
  if (!sh) throw new Error('missing_tab:' + SH_ATTEMPTS);

  const headers = _getHeaders_(sh);

  // required columns
  const idx = _indexMap_(headers, [
    'attempt_id','teacher_id','teacher_quiz_id','class_id','user_id','attempt_no',
    'status','started_at','submitted_at','updated_at','time_taken_s',
    'score_json','score_raw','score_total','score_pct'
  ]);

  // optional columns (do NOT use _indexMap_ or it will throw)
  const idxCandidateFields = headers.indexOf('candidate_fields_json');
  const idxCustomFields = headers.indexOf('custom_fields_json');

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { byUserId: {} };

  const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  const byUserId = {};

  for (let i = 0; i < values.length; i++) {
    const r = values[i];

    if (String(r[idx.teacher_id] || '').trim() !== String(teacher_id).trim()) continue;
    if (String(r[idx.teacher_quiz_id] || '').trim() !== String(teacher_quiz_id).trim()) continue;
    if (String(r[idx.class_id] || '').trim() !== String(class_id).trim()) continue;

    const user_id = String(r[idx.user_id] || '').trim();
    if (!user_id) continue;

    const st = String(r[idx.status] || '').trim().toUpperCase() || '';

    const a = {
      attempt_id: String(r[idx.attempt_id] || '').trim(),
      teacher_quiz_id: teacher_quiz_id,
      class_id: class_id,
      user_id: user_id,
      attempt_no: String(r[idx.attempt_no] || '').trim(),

      status: st,

      started_at: String(r[idx.started_at] || '').trim(),
      submitted_at: String(r[idx.submitted_at] || '').trim(),
      updated_at: String(r[idx.updated_at] || '').trim(),

      time_taken_s: String(r[idx.time_taken_s] || '').trim(),

      score_json: String(r[idx.score_json] || '').trim(),
      score_raw: String(r[idx.score_raw] || '').trim(),
      score_total: String(r[idx.score_total] || '').trim(),
      score_pct: String(r[idx.score_pct] || '').trim(),

      // NEW: attempt-level fields
      candidate_fields_json: (idxCandidateFields !== -1) ? String(r[idxCandidateFields] || '').trim() : '',
      custom_fields_json: (idxCustomFields !== -1) ? String(r[idxCustomFields] || '').trim() : ''
    };

    if (!byUserId[user_id]) byUserId[user_id] = [];
    byUserId[user_id].push(a);
  }

  // sort attempts for each user by attempt_no asc (makes FIRST rule deterministic)
  Object.keys(byUserId).forEach(uid => {
    byUserId[uid].sort((x,y) => _toIntDefault_(x.attempt_no, 0) - _toIntDefault_(y.attempt_no, 0));
  });

  return { byUserId };
}

function _avg_(arr) {
  const a = (arr || []).filter(x => isFinite(Number(x)));
  if (!a.length) return 0;
  const sum = a.reduce((s,v) => s + Number(v), 0);
  return Math.round((sum / a.length) * 100) / 100;
}

function _median_(arr) {
  const a = (arr || []).filter(x => isFinite(Number(x))).map(Number).sort((x,y)=>x-y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  if (a.length % 2 === 1) return a[mid];
  return Math.round(((a[mid - 1] + a[mid]) / 2) * 100) / 100;
}
function _coercePassThreshold_(gc) {
  const n = (gc && gc.pass_threshold_pct != null) ? Number(gc.pass_threshold_pct) : NaN;
  if (isFinite(n)) return Math.max(0, Math.min(100, n));
  // fallback only if gc missing/invalid
  return _passThresholdFromBands_(gc && gc.grade_bands);
}
function _passThresholdFromBands_(gradeBandsObj) {
  const bands = (gradeBandsObj && Array.isArray(gradeBandsObj.bands)) ? gradeBandsObj.bands : [];
  if (bands.length >= 2) {
    const v = Number(bands[1].min_pct);
    if (isFinite(v)) return v;
  }
  return 50;
}

function _preview_(s, n) {
  const t = String(s || '').replace(/\s+/g,' ').trim();
  if (!t) return '';
  if (t.length <= n) return t;
  return t.slice(0, Math.max(0, n - 1)) + '…';
}
