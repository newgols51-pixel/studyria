/* ════════════════════════════════════════════════════════════════
   brainlab-exams.js — STUDYRIA EXAM UNIVERSE v3.1 (additive layer)
   ════════════════════════════════════════════════════════════════
   BrainLab → Exam Universe → Organizations → Exam → Preparation Hub.
   Data-driven: adding an exam = registry entry, not new code.
   • Organizations layer (#brainlab/exams + #brainlab/exams/org/<id>)
     with REAL per-org / per-exam counts from the real question pool.
   • Exam variants (e.g. ADRE Driver / Grade IV Class VIII) honestly
     practice from their base exam pool — never fabricate questions.
   • Imported verified questions/PYQs come from the Studyria Exam
     Universe backend (euLive public read — Base44, zero migration).
   • Mock series: distinct seeded non-overlapping blocks from the REAL
     pool (existing mock engine, timer/auto-submit/palette preserved).
   • Hub modules: Progress, Continue, Daily, Quick, Mocks, PYQ (year/
     subject), Previous Year Papers, Subject practice, Mistake Book,
     Saved Questions (🔖 injected into any review, DOM-additive),
     Current Affairs, Syllabus, Exam Pattern (honest empty), Roadmap,
     Weak Areas, Recommendations — all real-data, own-session only.
   No engine/checkout/auth/DB changes. Existing routes preserved.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function B() { return window.BrainLab; }
  function V7() { return window.BrainLabV7 || {}; }
  var U = window.BrainLabUniverse = { _imp: {}, _impAt: 0, _cycles: [] };

  function esc(s) { var bl = B(); return bl ? bl.escape(s) : String(s == null ? '' : s); }

  /* ── v3 REGISTRIES (data-driven; adding exams = data, not code) ── */
  U.VARIANTS = {
    'adre-driver': { name: 'ADRE Grade III (Driver)', desc: 'Assam Direct Recruitment — Driver posts', base: 'adre' },
    'adre4-viii':  { name: 'ADRE Grade IV (Class VIII)', desc: 'Assam Direct Recruitment — Class VIII qualification posts', base: 'adre4' }
  };
  U.ORGS = [
    { id: 'adr',    ic: '🏛️', name: 'Assam Direct Recruitment', desc: 'ADRE — Grade III & Grade IV recruitment', exams: ['adre', 'adre-driver', 'adre4', 'adre4-viii'] },
    { id: 'police', ic: '🚔', name: 'Assam Police', desc: 'SI / Constable recruitment exams', exams: ['police'] },
    { id: 'apsc',   ic: '🎓', name: 'APSC', desc: 'Assam Public Service Commission exams', exams: ['apsc'] },
    { id: 'tet',    ic: '🏫', name: 'Assam TET', desc: 'Teacher Eligibility Test', exams: ['tet'] },
    { id: 'dhs',    ic: '🏥', name: 'DHS Assam', desc: 'Directorate of Health Services recruitment', exams: ['dhs'] },
    { id: 'ssc',    ic: '📋', name: 'SSC', desc: 'SSC CGL / CHSL and related exams', exams: ['ssc'] },
    { id: 'other',  ic: '🗂️', name: 'Other Assam Govt. Exams', desc: 'All other Assam government recruitment', exams: ['other'] }
  ];

  function examKey(id) {
    var m = { adre: 'ADRE', adre4: 'ADRE', apsc: 'APSC', police: 'Assam Police', tet: 'Assam TET', ssc: 'SSC', dhs: 'General', other: 'General' };
    if (m[id]) return m[id];
    var v = U.VARIANTS[id]; return v ? examKey(v.base) : 'General';
  }
  function examTerms(id) {
    var t = { adre: ['adre'], adre4: ['adre'], apsc: ['apsc'], police: ['assam police', 'police'], tet: ['assam tet', 'tet'], ssc: ['ssc'], dhs: ['dhs'], other: [] };
    if (t[id]) return t[id];
    var v = U.VARIANTS[id]; return v ? examTerms(v.base) : [];
  }
  function hub() { return (V7().EXAM_HUB || []); }
  function findExam(id) {
    var e = hub().filter(function (x) { return x.id === id; })[0];
    if (e) return e;
    var v = U.VARIANTS[id]; if (!v) return null;
    var b = hub().filter(function (x) { return x.id === v.base; })[0]; if (!b) return null;
    return { id: id, name: v.name, desc: v.desc, subjects: b.subjects.slice(), _base: v.base, _variant: true };
  }
  function allExams() {
    var out = hub().slice();
    Object.keys(U.VARIANTS).forEach(function (k) { var e = findExam(k); if (e) out.push(e); });
    return out;
  }
  function orgOf(id) { var o = U.ORGS.filter(function (g) { return g.exams.indexOf(id) !== -1; })[0]; return o || null; }
  function owned(id) { return !!(window._ownedPdfIds && window._ownedPdfIds.has && window._ownedPdfIds.has(String(id))); }

  /* deterministic seeded shuffle (mulberry32) — stable mock blocks */
  function seedShuffle(arr, seedStr) {
    var h = 1779033703 ^ seedStr.length;
    for (var i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    function rnd() { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
    return a;
  }

  /* ═══ REAL POOL: bank (exam_tags OR mapped subjects, deduped) + imported verified ═══ */
  U.pool = function (e) {
    var QB = window.STUDYRIA_QB || [], key = examKey(e.id).toUpperCase(), seen = {}, out = [];
    QB.forEach(function (q) {
      var k = String(String(q[0]).slice(0, 60) + q[5]);
      if (seen[k]) return;
      var tags = String(q[10] || '').toUpperCase();
      if (tags.indexOf(key) !== -1 || e.subjects.indexOf(q[7]) !== -1 || e.subjects.indexOf(q[8]) !== -1) { seen[k] = 1; out.push(q); }
    });
    ((U._imp[e.id] || {}).rows || []).forEach(function (r) { out.push(r); });
    return out;
  };
  U.pyqPool = function (e) {
    return U.pool(e).filter(function (q) { return String(q[17] || '').toUpperCase() === 'PYQ'; });
  };
  function pyqYears(pool) {
    var y = {};
    pool.forEach(function (q) { var m = String(q[18] || '').match(/(19|20)\d{2}/); if (m) y[m[0]] = 1; });
    return Object.keys(y).sort(function (a, b) { return b - a; });
  }
  function pyqSubjects(pool) {
    var s = {};
    pool.forEach(function (q) { if (q[7]) s[q[7]] = 1; });
    return Object.keys(s).sort();
  }
  function pyqCountIn(pool, year) { return pool.filter(function (q) { return String(q[18] || '').indexOf(year) !== -1; }).length; }

  /* cheap mock-count (mirrors mockSeries allocation) for card counters */
  U.mockCount = function (e) { var n = U.pool(e).length; return n < 10 ? 0 : Math.min(10, Math.floor(n / 10)); };

  /* imported verified questions from the Exam Universe backend (public
     euLive read — Base44 storage, admin-gated writes; zero migration) */
  U.fetchImported = function (cb) {
    var now = Date.now();
    if (U._impAt && now - U._impAt < 600000) { cb && cb(); return; }
    if (U._impPending) { U._impCbs.push(cb); return; }
    U._impPending = true; U._impCbs = [cb];
    function done() { U._impPending = false; U._impAt = Date.now(); (U._impCbs || []).forEach(function (f) { f && f(); }); U._impCbs = []; }
    fetch('https://vesper-501c3886.base44.app/functions/euLive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).then(function (r) { return r.json(); })
      .then(function (res) {
        U._cycles = (res && res.cycles) || [];
        U._imp = {};
        ((((res && res.ok) && res.questions) || [])).forEach(function (r) {
          var ex = r.exam || 'other';
          if (!U._imp[ex]) U._imp[ex] = { rows: [], meta: [] };
          U._imp[ex].rows.push([
            r.question, r.optA, r.optB, r.optC, r.optD, String(r.answer || 'a').toLowerCase(),
            r.explanation || '', r.subject || 'General Knowledge', r.topic || 'General', r.difficulty || 'medium',
            r.exam || '', '', r.optAAs || '', r.optBAs || '', r.optCAs || '', r.optDAs || '',
            '', r.isPyq ? 'PYQ' : 'MCQ', (r.sourceName || '') + (r.sourceYear ? ' ' + r.sourceYear : '')
          ]);
          U._imp[ex].meta.push(r);
        });
        done();
      })
      .catch(function () { done(); });
  };

  function examPDFs(e) {
    var terms = examTerms(e.id); if (!terms.length) return [];
    var pdfs = (window.PDFS || []).filter(function (p) { return p && p.title; });
    var hay = function (p) { return [p.category, p.tag, p.subcategory, p.title].join(' ').toLowerCase(); };
    return pdfs.filter(function (p) { return terms.some(function (t) { return hay(p).indexOf(t) !== -1; }); });
  }

  /* ═══ MOCK SERIES — distinct exam-style mocks from the REAL pool ═══ */
  U.mockSeries = function (e) {
    var pool = U.pool(e);
    if (pool.length < 10) return [];
    var blocks = Math.min(10, Math.max(1, Math.floor(pool.length / 10)));
    var per = Math.min(100, Math.max(10, Math.floor(pool.length / blocks)));
    var shuffled = seedShuffle(pool, 'mockseries:' + e.id);
    var series = [];
    for (var i = 0; i < blocks; i++) {
      var qs = shuffled.slice(i * per, i * per + per);
      if (qs.length < 10) break;
      series.push({ n: i + 1, qs: qs });
    }
    return series;
  };
  /* opens the DEDICATED TEST PAGE — hub stays a discovery page */
  U.startMockN = function (examId, n) {
    var e = findExam(examId); if (!e) return;
    location.hash = '#brainlab/exams/mock/' + examId + '/' + n;
  };

  /* ═══ DAILY EXAM PRACTICE — deterministic per-day real questions ═══ */
  U.dailyDone = function (e) {
    var bl = B(); if (!bl) return false;
    var t = new Date().toISOString().slice(0, 10);
    return (bl.getSessions() || []).some(function (s) { return s.exam === examKey(e.id) && (s.completed_at || '').slice(0, 10) === t && (s.total_questions || 0) >= 10; });
  };
  U.startDaily = function (examId) {
    var e = findExam(examId); if (!e) return;
    var bl = B(); if (!bl) return;
    var pool = U.pool(e); if (!pool.length) { bl.toast('No questions available for this exam yet.'); return; }
    var day = new Date(); var seed = day.getFullYear() + '-' + (day.getMonth() + 1) + '-' + day.getDate() + ':' + e.id;
    var qs = seedShuffle(pool, 'daily:' + seed).slice(0, Math.min(10, pool.length));
    bl.startQuizSession({ mode: 'quiz', title: e.name + ' Daily Practice', questions: qs.length, exam: examKey(e.id), pool: qs });
  };

  /* ═══ WEAK AREAS — own sessions only, hidden when insufficient data ═══ */
  U.weakAreas = function (e) {
    var bl = B(); if (!bl || !bl.user()) return [];
    var by = {};
    (bl.getSessions() || []).forEach(function (s) {
      if (s.exam !== examKey(e.id) && e.subjects.indexOf(s.category) === -1) return;
      if (s.category && s.category !== 'All') { (by[s.category] = by[s.category] || []).push(s.score || 0); }
    });
    var rows = [];
    Object.keys(by).forEach(function (k) {
      var arr = by[k];
      if (arr.length >= 2) rows.push({ cat: k, pct: Math.round(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length), n: arr.length });
    });
    return rows.sort(function (a, b) { return a.pct - b.pct; });
  };

  /* ═══ SAVED QUESTIONS (DOM-additive 🔖 in any review; localStorage store) ═══ */
  var SKEY = 'bl_eu_saved';
  U._norm = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 120); };
  U._saved = function () { try { return JSON.parse(localStorage.getItem(SKEY) || '[]'); } catch (e) { return []; } };
  U.saveToggle = function (h, t) {
    var l = U._saved(), had = l.some(function (x) { return x.h === h; });
    if (had) l = l.filter(function (x) { return x.h !== h; });
    else { l.unshift({ h: h, t: String(t || '').slice(0, 160), at: new Date().toISOString() }); if (l.length > 300) l = l.slice(0, 300); }
    try { localStorage.setItem(SKEY, JSON.stringify(l)); } catch (e) {}
    return !had;
  };
  U.savedList = function (e) {
    var l = U._saved(); if (!l.length) return { n: 0, pool: [] };
    var hs = {}; l.forEach(function (x) { hs[x.h] = 1; });
    var pool = U.pool(e).filter(function (q) { return hs[U._norm(q[0])]; });
    return { n: pool.length, pool: pool };
  };
  U.practiceSaved = function (examId) {
    var e = findExam(examId), bl = B(); if (!e || !bl) return;
    var s = U.savedList(e);
    if (!s.pool.length) { bl.toast('No saved questions from this exam pool yet.'); return; }
    bl.showCountPicker({ title: e.name + ' — Saved Questions', category: 'All', pool: s.pool, mode: 'quiz' });
  };
  /* inject 🔖 into every rendered review item (any engine — core untouched) */
  var _saveT = null;
  function _injectSave() {
    if (_saveT) return; _saveT = setTimeout(function () { _saveT = null;
      var items = document.querySelectorAll('.bl-review-item');
      for (var i = 0; i < items.length; i++) {
        if (items[i].querySelector('.bl-eu-save')) continue;
        (function (it) {
          var q = it.querySelector('.bl-review-q'); if (!q) return;
          var txt = (q.textContent || '').replace(/^\s*\d+\.\s*/, '');
          var h = U._norm(txt);
          var on = U._saved().some(function (x) { return x.h === h; });
          var b = document.createElement('button');
          b.type = 'button'; b.className = 'bl-eu-save' + (on ? ' on' : '');
          b.setAttribute('aria-label', 'Save question for revision');
          b.textContent = on ? '🔖 Saved' : '🔖 Save';
          b.onclick = function (ev) { ev.stopPropagation(); var now = U.saveToggle(h, txt); b.textContent = now ? '🔖 Saved' : '🔖 Save'; b.className = 'bl-eu-save' + (now ? ' on' : ''); };
          it.appendChild(b);
        })(items[i]);
      }
    }, 300);
  }
  if (typeof MutationObserver !== 'undefined') {
    var _mo = new MutationObserver(function () { _injectSave(); });
    var _bootObs = function () { if (document.body) _mo.observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _bootObs); else _bootObs();
  }

  /* ═══ ROADMAP — registry-driven stages, completion from real activity ═══ */
  U.ROADMAP = [
    { t: 'Foundation',        d: 'Start subject basics — quick practice & learn mode',        f: function (c) { return c.sessions >= 1; } },
    { t: 'Subject Practice',  d: 'Practice across 3+ different subjects of this exam',       f: function (c) { return c.subjectsTouched >= 3; } },
    { t: 'PYQ Practice',      d: 'Solve previous year questions year-by-year',               f: function (c) { return c.pyqSessions >= 1; } },
    { t: 'Mock Tests',        d: 'Attempt 2+ full-length timed mocks',                        f: function (c) { return c.mockSessions >= 2; } },
    { t: 'Revision',          d: 'Clear your Mistake Book & practice saved questions',       f: function (c) { return c.sessions >= 5; } },
    { t: 'Final Preparation', d: '5+ mocks with average accuracy ≥ 75%',                      f: function (c) { return c.mockSessions >= 5 && c.avg >= 75; } }
  ];
  U.roadmap = function (e, sess) {
    var ctx = { sessions: sess.length, subjectsTouched: 0, pyqSessions: 0, mockSessions: 0, avg: 0 };
    var sub = {};
    sess.forEach(function (s) {
      if (s.category && s.category !== 'All') sub[s.category] = 1;
      var m = String(s.mode || '') + ' ' + String(s.title || '');
      if (/pyq/i.test(m)) ctx.pyqSessions++;
      if (/mock/i.test(m)) ctx.mockSessions++;
    });
    ctx.subjectsTouched = Object.keys(sub).length;
    ctx.avg = sess.length ? Math.round(sess.reduce(function (a, s) { return a + (s.score || 0); }, 0) / sess.length) : 0;
    var cur = false;
    return U.ROADMAP.map(function (st) {
      var done = !!st.f(ctx); var isCur = !done && !cur; if (isCur) cur = true;
      return { t: st.t, d: st.d, done: done, current: isCur };
    });
  };

  /* ═══ LANDING — #brainlab/exams → ORGANIZATIONS (real counts) ═══ */
  U.renderLanding = function () {
    var c = document.getElementById('bl-sec-exams-body'); if (!c) return;
    var seen = {}, qn = 0, pyqAll = 0;
    (window.STUDYRIA_QB || []).forEach(function (q) { var k = String(String(q[0]).slice(0, 60) + q[5]); if (!seen[k]) { seen[k] = 1; qn++; if (String(q[17]).toUpperCase() === 'PYQ') pyqAll++; } });
    Object.keys(U._imp).forEach(function (k) { (U._imp[k].rows || []).forEach(function (r) { var kk = String(String(r[0]).slice(0, 60) + r[5]); if (!seen[kk]) { seen[kk] = 1; qn++; if (r[17] === 'PYQ') pyqAll++; } }); });
    var stats = [
      ['🏢', 'Organizations', U.ORGS.length],
      ['🎯', 'Exams', allExams().length],
      ['🧩', 'Questions', qn],
      ['📚', 'PYQs', pyqAll]
    ];
    var pdfN = (window.PDFS || []).filter(function (p) { return p && p.title; }).length;
    if (pdfN) stats.push(['📄', 'Study PDFs', pdfN]);
    var h = '<div class="bl-eu-hero"><div class="bl-eu-h-title">🎯 Exam Universe</div>'
      + '<div class="bl-eu-h-sub">Choose your exam and build a focused preparation plan — pick an organization, open your exam and get mocks, PYQs, papers, subjects and progress in one dedicated hub.</div>'
      + '<div class="bl-eu-stats">';
    stats.forEach(function (s) { h += '<div class="bl-eu-stat"><span class="bl-eu-stat-ic">' + s[0] + '</span><span class="bl-eu-stat-n">' + s[2].toLocaleString() + '</span><span class="bl-eu-stat-l">' + s[1] + '</span></div>'; });
    h += '</div><input type="search" class="bl-eu-search" id="bl-eu-search" placeholder="Search organizations or exams…" aria-label="Search organizations or exams"></div>'
      + '<div class="bl-eu-mini" style="margin:0 0 6px">🏢 Organizations</div>'
      + '<div class="bl-eu-grid" id="bl-eu-orgs"></div>'
      + '<div id="bl-eu-examresults"></div>';
    c.innerHTML = h;
    U._renderOrgs('');
    var inp = document.getElementById('bl-eu-search');
    if (inp) inp.addEventListener('input', function () { U._renderOrgs(inp.value); });
  };

  U._orgStats = function (o) {
    var seenQ = {}, n = 0, pyq = 0, mocks = 0, exN = 0;
    o.exams.forEach(function (id) {
      var e = findExam(id); if (!e) return;
      exN++;
      U.pool(e).forEach(function (q) {
        var k = String(String(q[0]).slice(0, 60) + q[5]);
        if (seenQ[k]) return;
        seenQ[k] = 1; n++;
        if (String(q[17]).toUpperCase() === 'PYQ') pyq++;
      });
      mocks += U.mockCount(e);
    });
    return { exN: exN, n: n, pyq: pyq, mocks: mocks };
  };

  U._orgCard = function (o) {
    var s = U._orgStats(o);
    return '<div class="bl-eu-card" onclick="BrainLabUniverse.openOrg(\'' + o.id + '\', true)">'
      + '<div class="bl-eu-card-top"><span class="bl-eu-card-ic">' + o.ic + '</span><div><div class="bl-eu-card-name">' + esc(o.name) + '</div>'
      + '<div class="bl-eu-card-desc">' + esc(o.desc) + '</div></div><span class="bl-eu-arrow">›</span></div>'
      + '<div class="bl-eu-card-stats">'
      + '<span>' + s.exN + ' exam' + (s.exN === 1 ? '' : 's') + '</span>'
      + '<span>' + s.n.toLocaleString() + ' questions</span>'
      + (s.pyq ? '<span>' + s.pyq + ' PYQs</span>' : '')
      + (s.mocks ? '<span>' + s.mocks + ' mocks</span>' : '')
      + '</div></div>';
  };

  U._examCard = function (e) {
    var r = { n: U.pool(e).length, pyq: U.pyqPool(e).length, mocks: U.mockCount(e), pdfs: examPDFs(e).length };
    var o = orgOf(e.id);
    return '<div class="bl-eu-card" onclick="BrainLabUniverse.openExam(\'' + e.id + '\', true)">'
      + '<div class="bl-eu-card-top"><span class="bl-eu-card-ic">🎯</span><div><div class="bl-eu-card-name">' + esc(e.name) + '</div>'
      + '<div class="bl-eu-card-desc">' + esc(e.desc) + (o ? ' · ' + esc(o.name) : '') + '</div></div><span class="bl-eu-arrow">›</span></div>'
      + '<div class="bl-eu-card-stats">'
      + '<span>' + r.n.toLocaleString() + ' questions</span>'
      + (r.pyq ? '<span>' + r.pyq + ' PYQ' + (r.pyq === 1 ? '' : 's') + '</span>' : '')
      + (r.mocks ? '<span>' + r.mocks + ' mock' + (r.mocks === 1 ? '' : 's') + '</span>' : '')
      + (r.pdfs ? '<span>' + r.pdfs + ' PDF' + (r.pdfs === 1 ? '' : 's') + '</span>' : '')
      + '</div></div>';
  };

  U._renderOrgs = function (q) {
    var g = document.getElementById('bl-eu-orgs'); if (!g) return;
    var res = document.getElementById('bl-eu-examresults');
    q = String(q || '').toLowerCase().trim();
    if (!q) {
      if (res) res.innerHTML = '';
      g.innerHTML = U.ORGS.map(U._orgCard).join('');
      return;
    }
    var oh = '';
    U.ORGS.forEach(function (o) { if ((o.name + ' ' + o.desc).toLowerCase().indexOf(q) !== -1) oh += U._orgCard(o); });
    g.innerHTML = oh || '<div class="bl-eu-empty">No organizations match “' + esc(q) + '”.</div>';
    if (!res) return;
    var exams = allExams().filter(function (e) { return (e.name + ' ' + e.desc + ' ' + e.subjects.join(' ')).toLowerCase().indexOf(q) !== -1; });
    res.innerHTML = exams.length
      ? '<div class="bl-eu-mini" style="margin:12px 0 6px">🎯 Matching exams</div><div class="bl-eu-grid">' + exams.map(U._examCard).join('') + '</div>'
      : '';
  };

  /* ═══ ORGANIZATION PAGE — #brainlab/exams/org/<id> → real exams ═══ */
  U.openOrg = function (id, push) {
    var o = U.ORGS.filter(function (g) { return g.id === id; })[0];
    if (!o) { U.renderLanding(); return; }
    if (push !== false) { location.hash = '#brainlab/exams/org/' + id; return; }
    var c = document.getElementById('bl-sec-exams-body'); if (!c) return;
    var cards = o.exams.map(function (eid) { var e = findExam(eid); return e ? U._examCard(e) : ''; }).join('');
    var cyc = U.cyclesFor(o.id);
    var h = '<button class="bl-eu-back" onclick="BrainLabUniverse.back()">← Exam Universe</button>'
      + '<div class="bl-eu-hero"><div class="bl-eu-h-title">' + o.ic + ' ' + esc(o.name) + '</div>'
      + '<div class="bl-eu-h-sub">' + esc(o.desc) + ' — choose a recruitment cycle or open a post-wise exam hub.</div></div>';
    if (cyc.length) {
      h += '<div class="bl-eu-mini" style="margin:0 0 6px">🗓️ Exam Cycles</div><div class="bl-eu-grid" style="margin-bottom:16px">';
      cyc.forEach(function (cy) {
        var up = cy.status === 'upcoming' || !cy.year;
        h += '<div class="bl-eu-card" onclick="BrainLabUniverse.openCycle(\'' + cy.id + '\', true)">'
          + '<div class="bl-eu-card-top"><span class="bl-eu-card-ic">' + (up ? '🟡' : '🏛️') + '</span><div>'
          + '<div class="bl-eu-card-name">' + esc(cy.cycleName) + '</div>'
          + '<div class="bl-eu-card-desc">' + (up ? 'Upcoming · Year to be announced' : 'Held in ' + cy.year) + '</div></div>'
          + '<span class="bl-eu-arrow">›</span></div>'
          + '<div class="bl-eu-card-stats">' + (up ? '<span>Preparation open</span><span>Coming soon</span>' : '<span>Previous Papers</span><span>Practice</span>') + '</div></div>';
      });
      h += '</div>';
    }
    h += '<div class="bl-eu-mini" style="margin:0 0 6px">🎯 Post-wise Exams</div>'
      + '<div class="bl-eu-grid">' + cards + '</div>';
    c.innerHTML = h;
    var top = document.getElementById('blv8-exams');
    if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  U._to = function (id) { var el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  /* ═══ EXAM CYCLES (data-driven from ExamCycle via euLive — no frontend hardcode) ═══ */
  U.cyclesFor = function (orgId) { return (U._cycles || []).filter(function (c) { return c.organizationId === orgId; }); };
  U.cycleById = function (id) { return (U._cycles || []).filter(function (c) { return c.id === id; })[0] || null; };

  /* real official paper records — lazy-load the existing ADRE papers config (metadata only) */
  U._papers = function (cb) {
    if (window.ADRE_PAPERS && window.ADRE_PAPERS.papers) { cb(window.ADRE_PAPERS.papers || []); return; }
    window.ADRE_PAPERS = { papers: [] };
    var s = document.createElement('script');
    s.src = '/adre-papers-config.js?v=20260827d';
    s.onload = function () { cb((window.ADRE_PAPERS && window.ADRE_PAPERS.papers) || []); };
    s.onerror = function () { cb([]); };
    document.head.appendChild(s);
  };
  /* grade/post-level matching — Grade III, Grade IV, Driver, Class VIII stay separate */
  U.papersForExam = function (id) {
    if (['adre', 'adre-driver', 'adre4', 'adre4-viii'].indexOf(id) === -1) return [];
    return ((window.ADRE_PAPERS && window.ADRE_PAPERS.papers) || []).filter(function (p) {
      var lvl = String(p.level || '') + ' ' + String(p.subtitle || '');
      if (id === 'adre-driver') return p.grade === 'Grade-III' && /driver/i.test(lvl);
      if (id === 'adre4-viii') return p.grade === 'Grade-IV' && /class viii/i.test(lvl);
      if (id === 'adre') return p.grade === 'Grade-III' && !/driver/i.test(lvl);
      if (id === 'adre4') return p.grade === 'Grade-IV' && !/class viii/i.test(lvl);
      return false;
    });
  };
  U._cycPyqPool = function (cy) {
    var org = U.ORGS.filter(function (g) { return g.id === cy.organizationId; })[0] || { exams: [] };
    var out = [];
    (org.exams || []).forEach(function (ex) {
      ((U._imp[ex] || {}).rows || []).forEach(function (r) {
        if (r[17] !== 'PYQ') return;
        var ym = String(r[18] || '').match(/(19|20)\d{2}/);
        if (cy.year && ym && Number(ym[0]) === cy.year) out.push(r);
      });
    });
    return out;
  };

  /* ═══ EXAM PREPARATION HUB — #brainlab/exams/<id> ═══ */
  /* ═══ EXAM PREPARATION HUB — #brainlab/exams/<id> (§12 order) ═══ */
  U.openExam = function (id, push) {
    var e = findExam(id); if (!e) { U.renderLanding(); return; }
    if (push !== false) { location.hash = '#brainlab/exams/' + id; return; }
    var bl = B(); if (!bl) return;
    var c = document.getElementById('bl-sec-exams-body'); if (!c) return;

    var pool = U.pool(e), pyq = U.pyqPool(e), mocks = U.mockSeries(e), key = examKey(id);
    var sess = (bl.getSessions() || []).filter(function (s) { return s.exam === key; });
    var yrs = pyqYears(pyq);
    U._e = e; U._pyqPool = pyq; U._mocks = mocks; U._pyqYears = yrs.length ? yrs : [];

    /* PYQ provenance: exam-cycle-matched vs source-year overlap (NEVER conflated) */
    var org = orgOf(id);
    var cycles = org ? U.cyclesFor(org.id) : [];
    var cycPyqN = {};
    cycles.forEach(function (cy) { cycPyqN[cy.id] = U._cycPyqPool(cy).length; });
    U._pyqCycles = cycles.filter(function (cy) { return cycPyqN[cy.id] > 0; });

    var h = '<button class="bl-eu-back" onclick="BrainLabUniverse.back()">← ' + (org ? esc(org.name) : 'Exam Universe') + '</button>';
    h += '<div class="bl-eu-hero"><div class="bl-eu-h-title">🎯 ' + esc(e.name) + '</div>'
      + '<div class="bl-eu-h-sub">' + esc(e.desc) + ' — complete preparation hub.</div>'
      + '<div class="bl-eu-badges">'
      + (mocks.length ? '<span class="bl-eu-badge">📝 Mock Tests</span>' : '')
      + (pyq.length ? '<span class="bl-eu-badge">📚 PYQs</span>' : '')
      + '<span class="bl-eu-badge">⚡ Practice</span><span class="bl-eu-badge">📰 Current Affairs</span>'
      + '</div><div class="bl-eu-stats">'
      + '<div class="bl-eu-stat"><span class="bl-eu-stat-ic">🧩</span><span class="bl-eu-stat-n">' + pool.length.toLocaleString() + '</span><span class="bl-eu-stat-l">Questions</span></div>'
      + '<div class="bl-eu-stat"><span class="bl-eu-stat-ic">📚</span><span class="bl-eu-stat-n">' + pyq.length + '</span><span class="bl-eu-stat-l">PYQs</span></div>'
      + '<div class="bl-eu-stat"><span class="bl-eu-stat-ic">📝</span><span class="bl-eu-stat-n">' + mocks.length + '</span><span class="bl-eu-stat-l">Mocks</span></div>'
      + '<div class="bl-eu-stat" id="bl-eu-pdfstat" style="display:none"></div>'
      + '</div>'
      + (e._variant ? '<div class="bl-eu-meta">ℹ️ A dedicated ' + esc(e.name) + ' question set is being curated — practice currently draws from the complete ' + esc((findExam(e._base) || {}).name || 'base exam') + ' pool.</div>' : '')
      + '</div>';

    /* resource filter chips (anchor scroll — NOT a navigation system) */
    h += '<div class="bl-eu-chips"><button onclick="BrainLabUniverse._to(\'bl-eu-sec-prog\')">All</button>'
      + '<button onclick="BrainLabUniverse._to(\'bl-eu-sec-tests\')">Tests</button>'
      + '<button onclick="BrainLabUniverse._to(\'bl-eu-sec-pyq\')">PYQs</button>'
      + '<button onclick="BrainLabUniverse._to(\'bl-eu-sec-papers\')">Papers</button>'
      + '<button onclick="BrainLabUniverse._to(\'bl-eu-sec-subjects\')">Subjects</button>'
      + '<button onclick="BrainLabUniverse._to(\'bl-eu-sec-quick\')">MCQs</button>'
      + '<button onclick="BrainLabUniverse._to(\'bl-eu-sec-mats\')">Ebooks</button>'
      + '<button onclick="BrainLabUniverse._to(\'bl-eu-sec-ca\')">Affairs</button></div>';

    /* ── Your Progress ── */
    h += '<div class="bl-eu-sec" id="bl-eu-sec-prog"><div class="bl-eu-sec-t">📊 Your ' + esc(e.name) + ' Progress</div>';
    if (sess.length) {
      var avg = Math.round(sess.reduce(function (a, s) { return a + (s.score || 0); }, 0) / sess.length);
      var best = Math.max.apply(null, sess.map(function (s) { return s.score || 0; }));
      var qs = sess.reduce(function (a, s) { return a + (s.total_questions || 0); }, 0);
      var tt = sess.reduce(function (a, s) { return a + (s.time_taken || 0); }, 0);
      var last = sess.reduce(function (m, s) { var d = s.completed_at || ''; return d > m ? d : m; }, '');
      h += '<div class="bl-eu-prog">'
        + '<div class="bl-eu-p"><div class="bl-eu-p-n">' + avg + '%</div><div class="bl-eu-p-l">Accuracy</div></div>'
        + '<div class="bl-eu-p"><div class="bl-eu-p-n">' + sess.length + '</div><div class="bl-eu-p-l">Tests</div></div>'
        + '<div class="bl-eu-p"><div class="bl-eu-p-n">' + qs.toLocaleString() + '</div><div class="bl-eu-p-l">Questions</div></div>'
        + '<div class="bl-eu-p"><div class="bl-eu-p-n">' + best + '%</div><div class="bl-eu-p-l">Best score</div></div>'
        + '</div>'
        + (tt ? '<div class="bl-eu-meta">⏱ Time invested: ' + Math.round(tt / 60) + ' min</div>' : '')
        + (last ? '<div class="bl-eu-meta">Last activity: ' + esc(last.slice(0, 10)) + '</div>' : '');
    } else {
      h += '<div class="bl-eu-empty">Start your first test to build your progress.</div>';
    }
    h += '</div>';

    /* ── Continue / Daily ── */
    var dailyDone = U.dailyDone(e);
    h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">🔥 Continue Preparation</div>';
    if (sess.length) {
      var s = sess[sess.length - 1];
      h += '<div class="bl-eu-continue"><div><div class="bl-eu-card-name">' + esc(s.title || 'Practice') + '</div>'
        + '<div class="bl-eu-card-desc">Last attempted · ' + (s.score || 0) + '% accuracy</div></div>'
        + '<button class="bl-eu-btn" onclick="BrainLab.retrySession(\'' + esc(s.id) + '\')">CONTINUE</button></div>';
    } else {
      h += '<div class="bl-eu-empty">Start your first practice session.</div>';
    }
    h += '<div class="bl-eu-continue"><div><div class="bl-eu-card-name">⚡ Today\'s ' + esc(e.name) + ' Practice</div>'
      + '<div class="bl-eu-card-desc">10 exam-focused questions, fresh every day</div></div>'
      + (dailyDone ? '<span class="bl-eu-done">✓ Done today</span>'
        : '<button class="bl-eu-btn" onclick="BrainLabUniverse.startDaily(\'' + e.id + '\')">START</button>')
      + '</div></div>';

    /* ── Mock Tests: distinct mocks from real pool ── */
    h += '<div class="bl-eu-sec" id="bl-eu-sec-tests"><div class="bl-eu-sec-t">📝 Mock Tests</div>'
      + '<div class="bl-eu-sec-s">' + mocks.length + ' distinct full mocks — each built from a unique, non-overlapping set of the ' + pool.length.toLocaleString() + '-question real pool. Timed 1 min/question, auto-submit, review & analytics.</div>';
    if (mocks.length) {
      h += '<div class="bl-eu-mocks">';
      mocks.forEach(function (m) {
        h += '<div class="bl-eu-testrow" style="cursor:pointer" onclick="location.hash=\'#brainlab/exams/mock/' + e.id + '/' + m.n + '\'"><div>'
          + '<div class="bl-eu-card-name">' + (org ? org.ic + ' ' : '') + esc(e.name) + ' — Mock Test ' + m.n + '</div>'
          + '<div class="bl-eu-card-desc">' + m.qs.length + ' Minutes · ' + m.qs.length + ' MCQs · exam-style, auto-submit</div></div>'
          + '<span class="bl-eu-arrow">›</span></div>';
      });
      h += '</div>';
    } else {
      h += '<div class="bl-eu-empty">Not enough questions in this exam pool yet to build a mock series — import verified questions via Admin → BrainLab Manager to unlock mocks.</div>';
    }
    h += '</div>';

    /* ── PYQ Practice — EXAM CYCLE ≠ source year; honest provenance ── */
    h += '<div class="bl-eu-sec" id="bl-eu-sec-pyq"><div class="bl-eu-sec-t">📚 PYQ Practice</div>';
    if (U._pyqCycles.length) {
      h += '<div class="bl-eu-sec-s">Verified PYQs mapped to this exam\'s recruitment cycles.</div>'
        + '<div class="bl-eu-mini">By exam cycle:</div><div class="bl-eu-chips">'
        + U._pyqCycles.map(function (cy, i) { return '<button onclick="BrainLabUniverse.startPyqCycle(' + i + ')">' + esc(cy.cycleName) + (cy.year ? ' · ' + cy.year : '') + ' (' + cycPyqN[cy.id] + ')</button>'; }).join('')
        + '</div>';
    } else if (cycles.length) {
      h += '<div class="bl-eu-empty">No ' + esc(cycles[0].cycleName.split(' ')[0]) + '-sourced PYQs verified for ' + esc(e.name) + ' yet — exam-cycle PYQs (' + cycles.map(function (cy) { return esc(cy.cycleName); }).join(', ') + ') can be imported via Admin → BrainLab Manager.</div>';
    }
    if (pyq.length) {
      var subs = pyqSubjects(pyq);
      h += '<div class="bl-eu-sec-s">' + pyq.length + ' PYQ' + (pyq.length === 1 ? '' : 's') + ' currently available for practice via syllabus overlap.</div>'
        + '<div class="bl-eu-btns2" style="margin-bottom:8px">'
        + '<button class="bl-eu-btn" onclick="BrainLabUniverse.startPyq(0)">PRACTICE ALL</button>'
        + '<button class="bl-eu-btn bl-eu-btn2" onclick="BrainLabPages.go(\'pyq\')">PYQ HUB</button></div>';
      if (yrs.length) {
        h += '<div class="bl-eu-mini">By source year (question provenance — NOT exam cycles):</div><div class="bl-eu-chips">'
          + yrs.map(function (y, i) { return '<button onclick="BrainLabUniverse.startPyqYear(' + i + ')">' + y + '</button>'; }).join('') + '</div>'
          + '<div class="bl-eu-meta">Source years indicate the original exam these questions were taken from (year verification pending) — they are not ' + esc(org ? org.name : 'this exam') + ' recruitment versions.</div>';
      }
      if (subs.length > 1) {
        U._pyqSubs = subs;
        h += '<div class="bl-eu-mini">By subject:</div><div class="bl-eu-chips">' + subs.map(function (s2, i) { return '<button onclick="BrainLabUniverse.startPyqSub(' + i + ')">' + esc(s2) + '</button>'; }).join('') + '</div>';
      }
    } else if (!U._pyqCycles.length) {
      h += '<div class="bl-eu-empty">No PYQs mapped to this exam yet — the PYQ bank is growing.</div>';
    }
    h += '</div>';

    /* ── Previous Year Papers — REAL official paper records grouped by exam cycle ── */
    h += '<div class="bl-eu-sec" id="bl-eu-sec-papers"><div class="bl-eu-sec-t">📄 Previous Year Papers</div>'
      + '<div class="bl-eu-sec-s">Actual official papers with answer keys, grouped by recruitment cycle — no generated or unrelated years.</div>'
      + '<div id="bl-eu-papers-body">Loading…</div></div>';

    /* ── Subject-wise ── */
    h += '<div class="bl-eu-sec" id="bl-eu-sec-subjects"><div class="bl-eu-sec-t">📖 Subject-wise Practice</div>';
    var subs2 = e.subjects.map(function (s) { return { s: s, n: bl.countByTopic(s, 'All') }; }).filter(function (r) { return r.n > 0; });
    U._subjRows = subs2;
    if (subs2.length) {
      h += '<div class="bl-eu-subj">';
      subs2.forEach(function (r, i) {
        h += '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">' + esc(r.s) + '</div>'
          + '<div class="bl-eu-card-desc">' + r.n.toLocaleString() + ' questions</div></div>'
          + '<button class="bl-eu-btn" onclick="BrainLabUniverse.practiceSubject(' + i + ')">PRACTICE</button></div>';
      });
      h += '</div>';
    } else { h += '<div class="bl-eu-empty">No mapped subjects yet.</div>'; }
    h += '</div>';

    /* ── Quick Practice ── */
    h += '<div class="bl-eu-quick" id="bl-eu-sec-quick"><div class="bl-eu-sec-t">⚡ Quick Practice</div>'
      + '<div class="bl-eu-card-desc">Have a few minutes? Start a quick exam-focused session.</div>'
      + '<div class="bl-eu-quick-btns">'
      + [10, 25, 50].map(function (k) { return '<button class="bl-eu-btn" onclick="BrainLab.startQuizSession({mode:\'quiz\',title:\'' + esc(e.name) + ' Quick ' + k + '\',questions:' + k + ',exam:\'' + key + '\'})">QUICK ' + k + '</button>'; }).join('')
      + '</div></div>';

    /* ── Mistake Book (exam-scoped, real wrong answers) ── */
    var mist = (bl.getMistakes() || []).filter(function (m) {
      return e.subjects.indexOf(m.topic) !== -1 || e.subjects.indexOf(m.category) !== -1;
    });
    h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">❌ My Mistakes</div>';
    if (mist.length) {
      h += '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">' + mist.length + ' question' + (mist.length === 1 ? '' : 's') + ' to review</div>'
        + '<div class="bl-eu-card-desc">Wrong answers from this exam\'s subjects — practice until mastered</div></div>'
        + '<div class="bl-eu-btns2"><button class="bl-eu-btn" onclick="BrainLab.retryMistakes()">PRACTICE</button>'
        + '<button class="bl-eu-btn bl-eu-btn2" onclick="BrainLabPages.go(\'mistakes\')">VIEW ALL</button></div></div>';
    } else {
      h += '<div class="bl-eu-empty">No mistakes recorded yet — wrong answers in practice are saved here automatically.</div>';
    }
    h += '</div>';

    /* ── Saved Questions (🔖 from any review) ── */
    var saved = U.savedList(e);
    h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">🔖 Saved Questions</div>';
    if (saved.n) {
      h += '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">' + saved.n + ' saved question' + (saved.n === 1 ? '' : 's') + ' from this exam</div>'
        + '<div class="bl-eu-card-desc">Tap 🔖 Save on any question in a test review to bookmark it here</div></div>'
        + '<button class="bl-eu-btn" onclick="BrainLabUniverse.practiceSaved(\'' + e.id + '\')">PRACTICE</button></div>';
    } else {
      h += '<div class="bl-eu-empty">No saved questions yet — finish a test and tap 🔖 Save on any question in the review to keep it for revision.</div>';
    }
    h += '</div>';

    /* ── Current Affairs ── */
    h += '<div class="bl-eu-sec" id="bl-eu-sec-ca"><div class="bl-eu-sec-t">📰 Current Affairs</div>'
      + '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">Stay exam-ready</div>'
      + '<div class="bl-eu-card-desc">Daily published affairs — quiz built from real updates</div></div>'
      + '<div class="bl-eu-btns2"><button class="bl-eu-btn" onclick="BrainLabV7.startAffairsQuiz()">QUIZ</button>'
      + '<button class="bl-eu-btn bl-eu-btn2" onclick="BrainLabPages.go(\'current-affairs\')">VIEW ALL</button></div></div></div>';

    /* ── Study Materials (canonical PDF flow — papers + ebooks) ── */
    h += '<div class="bl-eu-sec" id="bl-eu-sec-mats"><div class="bl-eu-sec-t">📚 Study Materials &amp; Papers</div><div class="bl-eu-empty" id="bl-eu-mats-body">Loading…</div></div>';

    /* ── Syllabus coverage (real bank topics) ── */
    h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">📋 Syllabus Coverage</div>'
      + '<div class="bl-eu-sec-s">Subjects and topics with real questions available in the Studyria bank for this exam.</div>';
    if (subs2.length) {
      h += '<div class="bl-eu-about">';
      subs2.slice(0, 12).forEach(function (r) {
        var topics = bl.getTopics(r.s) || [];
        h += '<div><span class="bl-eu-ab-l">' + esc(r.s) + '</span> ' + esc(topics.slice(0, 5).join(', ') || '—') + '</div>';
      });
      h += '</div>';
    } else { h += '<div class="bl-eu-empty">Syllabus data not published yet.</div>'; }
    h += '</div>';

    /* ── Exam Pattern (honest — only when published) ── */
    h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">📝 Exam Pattern</div><div class="bl-eu-empty">Exam pattern information will be updated soon — official details will appear here once published.</div></div>';

    /* ── Preparation Roadmap (registry-driven, real completion) ── */
    var road = U.roadmap(e, sess);
    h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">📅 Preparation Roadmap</div>'
      + '<div class="bl-eu-sec-s">Suggested stages for ' + esc(e.name) + ' — progress is calculated from your real activity.</div><div class="bl-eu-road">';
    road.forEach(function (st, i) {
      h += '<div class="bl-eu-road-st ' + (st.done ? 'done' : (st.current ? 'cur' : '')) + '">'
        + '<div class="bl-eu-road-dot">' + (st.done ? '✓' : (i + 1)) + '</div>'
        + '<div><div class="bl-eu-card-name">' + esc(st.t) + '</div><div class="bl-eu-card-desc">' + esc(st.d) + '</div></div></div>';
    });
    h += '</div></div>';

    /* ── Weak Areas (hidden when insufficient data) ── */
    var weak = U.weakAreas(e);
    if (weak.length) {
      h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">🎯 Improve Your Weak Areas</div>';
      weak.slice(0, 4).forEach(function (w) {
        h += '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">' + esc(w.cat) + '</div>'
          + '<div class="bl-eu-card-desc">Accuracy: ' + w.pct + '% · ' + w.n + ' sessions</div></div>'
          + '<button class="bl-eu-btn" onclick="BrainLabUniverse.practiceCategory(\'' + esc(w.cat) + '\')">PRACTICE</button></div>';
      });
      h += '</div>';
    }

    /* ── Recommended ── */
    h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">✨ Recommended for You</div>';
    if (weak.length) {
      h += '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">🧩 Practice ' + esc(weak[0].cat) + '</div>'
        + '<div class="bl-eu-card-desc">Your accuracy here is ' + weak[0].pct + '% — revise this subject</div></div>'
        + '<button class="bl-eu-btn" onclick="BrainLabUniverse.practiceCategory(\'' + esc(weak[0].cat) + '\')">PRACTICE</button></div>';
    }
    if (mocks.length) {
      h += '<div class="bl-eu-testrow" style="cursor:pointer" onclick="location.hash=\'#brainlab/exams/mock/' + e.id + '/1\'"><div><div class="bl-eu-card-name">' + (org ? org.ic + ' ' : '') + esc(e.name) + ' — Mock Test 1</div>'
        + '<div class="bl-eu-card-desc">' + mocks[0].qs.length + ' Minutes · ' + mocks[0].qs.length + ' MCQs · exam-style</div></div>'
        + '<span class="bl-eu-arrow">›</span></div>';
    }
    if (pyq.length) {
      h += '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">📚 PYQ Practice</div>'
        + '<div class="bl-eu-card-desc">' + pyq.length + ' previous year questions</div></div>'
        + '<button class="bl-eu-btn" onclick="BrainLabUniverse.startPyq(0)">PRACTICE</button></div>';
    }
    if (!weak.length && !mocks.length && !pyq.length) h += '<div class="bl-eu-empty">Complete a practice session to get real recommendations.</div>';
    h += '</div>';

    /* ── About ── */
    h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">ℹ️ About This Exam</div>'
      + '<div class="bl-eu-about"><div><span class="bl-eu-ab-l">Exam</span> ' + esc(e.name) + '</div>'
      + (org ? '<div><span class="bl-eu-ab-l">Organization</span> ' + esc(org.name) + '</div>' : '')
      + '<div><span class="bl-eu-ab-l">Focus</span> ' + esc(e.desc) + '</div>'
      + '<div><span class="bl-eu-ab-l">Subjects</span> ' + esc(e.subjects.join(', ')) + '</div></div></div>';

    c.innerHTML = h;
    U._loadPapers(e);
    U._loadPDFs(e);
    var top = document.getElementById('blv8-exams');
    if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* real official papers → hub Papers section (lazy config load; grouped by cycle) */
  U._loadPapers = function (e) {
    var host = document.getElementById('bl-eu-papers-body'); if (!host) return;
    if (['adre', 'adre-driver', 'adre4', 'adre4-viii'].indexOf(e.id) === -1) {
      host.innerHTML = '<div class="bl-eu-empty">No official paper records mapped to this exam yet — paper PDFs appear under Study Materials.</div>';
      return;
    }
    U._papers(function () {
      var mine = U.papersForExam(e.id);
      var cyc = U.cyclesFor('adr');
      var hh = '';
      cyc.forEach(function (cy) {
        var ps = mine.filter(function (p) { return p.edition === cy.cycleName || (cy.year && p.year === cy.year); });
        if (!ps.length) return;
        hh += '<div class="bl-eu-mini" style="margin-top:10px">' + esc(cy.cycleName) + ' — ' + (cy.year || 'Upcoming') + '</div>';
        ps.forEach(function (p) {
          hh += '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">' + esc(p.title) + '</div>'
            + '<div class="bl-eu-card-desc">' + esc(p.subtitle || p.level || '') + ' · ' + (p.total_questions || 0) + ' questions'
            + (p.exam_date ? ' · exam ' + esc(p.exam_date) : '') + '</div></div>'
            + '<button class="bl-eu-btn" onclick="navigate(\'adre-papers\')">OPEN</button></div>';
        });
      });
      if (!mine.length) hh = '<div class="bl-eu-empty">No official paper records published for this exam yet.</div>';
      host.innerHTML = hh;
    });
  };

  /* ── PYQ starters (pool injection → existing engine) ── */
  U.startPyq = function (mode) {
    var bl = B(); if (!bl || !U._pyqPool || !U._pyqPool.length) return;
    bl.showCountPicker({ title: (U._e ? U._e.name : '') + ' PYQ Practice', category: 'All', pool: U._pyqPool, mode: 'pyq' });
  };
  U.startPyqCycle = function (i) {
    var cy = (U._pyqCycles || [])[i]; var bl = B(); if (!bl || !cy) return;
    var p = U._cycPyqPool(cy);
    if (!p.length) { bl.toast('No PYQs mapped to ' + cy.cycleName); return; }
    bl.showCountPicker({ title: cy.cycleName + (cy.year ? ' (' + cy.year + ')' : '') + ' — PYQ Practice', category: 'All', pool: p, mode: 'pyq' });
  };
  U.startPyqYear = function (i) {
    var y = (U._pyqYears || [])[i]; var bl = B(); if (!bl || !y) return;
    var p = (U._pyqPool || []).filter(function (q) { return String(q[18] || '').indexOf(y) !== -1; });
    if (!p.length) { bl.toast('No PYQs for ' + y); return; }
    bl.showCountPicker({ title: (U._e ? U._e.name : '') + ' PYQ — ' + y, category: 'All', pool: p, mode: 'pyq' });
  };
  U.startPyqSub = function (i) {
    var s = (U._pyqSubs || [])[i]; var bl = B(); if (!bl) return;
    var p = (U._pyqPool || []).filter(function (q) { return q[7] === s; });
    if (!p.length) { bl.toast('No PYQs for ' + s); return; }
    bl.showCountPicker({ title: (U._e ? U._e.name : '') + ' PYQ — ' + s, category: s, pool: p, mode: 'pyq' });
  };

  /* ── PDF discovery: window.PDFS, else one real published-only Supabase read ── */
  U._loadPDFs = function (e) {
    var terms = examTerms(e.id);
    function fill(list) {
      var papers = list.filter(function (p) { return /question paper|previous year|solved paper|pyq/i.test([p.title, p.category].join(' ')); });
      var mats = list.filter(function (p) { return papers.indexOf(p) === -1; });
      function cardHTML(p) {
        var own = owned(p.id), free = !!p.free;
        var badge = own ? '✓ OWNED' : (free ? 'FREE' : (p.price ? '₹' + p.price : 'PREMIUM'));
        return '<div class="bl-eu-pdf" onclick="openDetail(\'' + esc(p.id) + '\')">'
          + (p.cover_url ? '<img class="bl-eu-pdf-cov" src="' + esc(p.cover_url) + '" alt="" loading="lazy">' : '<div class="bl-eu-pdf-cov bl-eu-pdf-noc">📄</div>')
          + '<div class="bl-eu-pdf-mid"><div class="bl-eu-card-name">' + esc(p.title) + '</div>'
          + '<div class="bl-eu-card-desc">' + esc(p.category || 'Study material') + ' · ' + badge + '</div></div>'
          + '<span class="bl-eu-arrow">›</span></div>';
      }
      var mb = document.getElementById('bl-eu-mats-body');
      if (mb) mb.innerHTML =
        (papers.length ? '<div class="bl-eu-mini" style="margin-top:2px">📄 Question paper PDFs</div>' + papers.map(cardHTML).join('') : '')
        + '<div class="bl-eu-mini" style="margin-top:8px">📚 Study materials &amp; ebooks</div>'
        + (mats.length ? mats.map(cardHTML).join('') : '<div class="bl-eu-empty">No study materials published yet.</div>');
      var st = document.getElementById('bl-eu-pdfstat');
      if (st && list.length) { st.style.display = ''; st.innerHTML = '<span class="bl-eu-stat-ic">📄</span><span class="bl-eu-stat-n">' + list.length + '</span><span class="bl-eu-stat-l">PDFs</span>'; }
    }
    var local = examPDFs(e);
    if (local.length) { fill(local); return; }
    var sb = window.supabase || window.supabaseClient;
    if (!terms.length || !sb) { fill([]); return; }
    sb.from('pdfs').select('id,title,category,free,price,cover_url,download_count').eq('status', 'published').limit(200)
      .then(function (res) {
        var data = (res && res.data) || [];
        var hay = function (p) { return [p.category, p.tag, p.subcategory, p.title].join(' ').toLowerCase(); };
        fill(data.filter(function (p) { return terms.some(function (t) { return hay(p).indexOf(t) !== -1; }); }));
      })
      .catch(function () { fill([]); });
  };

  /* ── controls ── */
  U.back = function () {
    var hh = location.hash || '';
    var cm = hh.match(/#brainlab\/exams\/cycle\/([a-z0-9]+)/);
    if (cm) { var cy = U.cycleById(cm[1]); if (cy) { location.hash = '#brainlab/exams/org/' + cy.organizationId; return; } location.hash = '#brainlab/exams'; return; }
    if (hh.indexOf('#brainlab/exams/org/') === 0) { location.hash = '#brainlab/exams'; return; }
    var em = hh.match(/#brainlab\/exams\/([a-z0-9-]+)/);
    if (em) { var o = orgOf(em[1]); if (o) { location.hash = '#brainlab/exams/org/' + o.id; return; } }
    location.hash = '#brainlab/exams';
  };

  /* ═══ CYCLE PAGE — #brainlab/exams/cycle/<id> (real papers + honest PYQ + post types) ═══ */
  U.openCycle = function (cid, push) {
    var cy = U.cycleById(cid);
    if (!cy) { U.renderLanding(); return; }
    if (push !== false) { location.hash = '#brainlab/exams/cycle/' + cid; return; }
    var c = document.getElementById('bl-sec-exams-body'); if (!c) return;
    var o = U.ORGS.filter(function (g) { return g.id === cy.organizationId; })[0] || null;
    var upcoming = cy.status === 'upcoming' || !cy.year;

    var h = '<button class="bl-eu-back" onclick="BrainLabUniverse.back()">← ' + esc((o || {}).name || 'Exam Universe') + '</button>'
      + '<div class="bl-eu-hero"><div class="bl-eu-h-title">' + (upcoming ? '🟡' : '🏛️') + ' ' + esc(cy.cycleName) + '</div>'
      + '<div class="bl-eu-h-sub">' + esc(cy.description || '') + '</div>'
      + '<div class="bl-eu-badges">'
      + (upcoming ? '<span class="bl-eu-badge">🟡 Upcoming</span><span class="bl-eu-badge">Year to be announced</span>' : '<span class="bl-eu-badge">✅ Held · ' + cy.year + '</span>')
      + (o ? '<span class="bl-eu-badge">' + esc(o.name) + '</span>' : '') + '</div>'
      + (cy.examDate ? '<div class="bl-eu-meta">📅 Official exam date: ' + esc(cy.examDate) + '</div>' : '')
      + (cy.applicationDate ? '<div class="bl-eu-meta">📝 Applications: ' + esc(cy.applicationDate) + '</div>' : '')
      + (cy.officialSourceUrl ? '<div class="bl-eu-meta">🔗 Source: <a href="' + esc(cy.officialSourceUrl) + '" style="font-weight:700">' + esc(cy.officialSource || 'Official reference') + '</a></div>' : (cy.officialSource ? '<div class="bl-eu-meta">🔗 Source: ' + esc(cy.officialSource) + '</div>' : ''))
      + '</div>';

    /* real official papers of this cycle (records only — grouped by grade) */
    h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">📄 Official Previous Year Papers</div>'
      + '<div class="bl-eu-sec-s">Actual paper records with answer keys — open any paper to practise it.</div>'
      + '<div id="bl-eu-cyc-papers">Loading…</div></div>';

    /* PYQs mapped to this cycle — only real data */
    h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">📚 PYQ Practice</div>';
    var cyp = U._cycPyqPool(cy);
    U._cycPyq = cyp; U._cycPyqCy = cy;
    if (upcoming) {
      h += '<div class="bl-eu-empty">PYQs for ' + esc(cy.cycleName) + ' will be published after the exam — practise post-wise mock tests and previous papers meanwhile.</div>';
    } else if (cyp.length) {
      h += '<div class="bl-eu-sec-s">' + cyp.length + ' verified PYQ' + (cyp.length === 1 ? '' : 's') + ' mapped to ' + esc(cy.cycleName) + '.</div>'
        + '<button class="bl-eu-btn" onclick="BrainLabUniverse.startCycPyq()">PRACTICE ' + esc(cy.cycleName) + ' PYQs</button>';
    } else {
      h += '<div class="bl-eu-empty">No ' + esc(cy.cycleName) + ' PYQs imported yet — verified PYQs can be added via Admin → BrainLab Manager.</div>';
    }
    h += '</div>';

    /* post-wise exams of this organization */
    if (o) {
      h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">🎯 Post-wise Preparation</div>'
        + '<div class="bl-eu-sec-s">Each post/level keeps its own mocks, PYQs, papers, subjects and progress.</div>'
        + '<div class="bl-eu-grid">' + o.exams.map(function (eid) { var e = findExam(eid); return e ? U._examCard(e) : ''; }).join('') + '</div></div>';
    }

    c.innerHTML = h;

    /* fill real papers (lazy config load) */
    U._papers(function () {
      var host = document.getElementById('bl-eu-cyc-papers'); if (!host) return;
      var mine = ((window.ADRE_PAPERS && window.ADRE_PAPERS.papers) || []).filter(function (p) { return p.edition === cy.cycleName || (cy.year && p.year === cy.year); });
      if (!mine.length) { host.innerHTML = '<div class="bl-eu-empty">No official paper records published for this cycle yet.</div>'; return; }
      var g3 = mine.filter(function (p) { return p.grade === 'Grade-III'; });
      var g4 = mine.filter(function (p) { return p.grade === 'Grade-IV'; });
      var hh2 = '';
      [[ 'Grade III posts', g3 ], [ 'Grade IV posts', g4 ]].forEach(function (grp) {
        if (!grp[1].length) return;
        hh2 += '<div class="bl-eu-mini">' + grp[0] + '</div>';
        grp[1].forEach(function (p) {
          hh2 += '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">' + esc(p.title) + '</div>'
            + '<div class="bl-eu-card-desc">' + esc(p.subtitle || p.level || '') + ' · ' + (p.total_questions || 0) + ' questions'
            + (p.exam_date ? ' · exam ' + esc(p.exam_date) : '') + '</div></div>'
            + '<button class="bl-eu-btn" onclick="navigate(\'adre-papers\')">OPEN</button></div>';
        });
      });
      host.innerHTML = hh2;
    });

    var top = document.getElementById('blv8-exams');
    if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  U.findExam = findExam; /* export for admin mock-status panel */
  U.examKey = examKey; /* export for dedicated test page session tagging */
  U.startCycPyq = function () {
    var bl = B(); if (!bl || !U._cycPyq || !U._cycPyq.length) return;
    var cy = U._cycPyqCy || null;
    bl.showCountPicker({ title: (cy ? cy.cycleName : 'Cycle') + ' — PYQ Practice', category: 'All', pool: U._cycPyq, mode: 'pyq' });
  };
  U.practiceSubject = function (i) {
    var bl = B(), r = (U._subjRows || [])[i]; if (!bl || !r) return;
    bl.showCountPicker({ title: r.s, category: r.s, pool: bl.filterQuestions({ category: r.s }), mode: 'quiz' });
  };
  U.practiceCategory = function (cat) {
    var bl = B(); if (!bl) return;
    bl.showCountPicker({ title: cat, category: cat, pool: bl.filterQuestions({ category: cat }), mode: 'quiz' });
  };

  /* boot: refresh imported questions when a Universe route opens */
  var _origRenderLanding = U.renderLanding;
  U.renderLanding = function () { U.fetchImported(function () { _origRenderLanding(); }); };
  var _origOpen = U.openExam;
  U.openExam = function (id, push) {
    if (push !== false) return _origOpen(id, push);
    U.fetchImported(function () { _origOpen(id, push); });
  };
  var _origOrg = U.openOrg;
  U.openOrg = function (id, push) {
    if (push !== false) return _origOrg(id, push);
    U.fetchImported(function () { _origOrg(id, push); });
  };
  var _origCycle = U.openCycle;
  U.openCycle = function (id, push) {
    if (push !== false) return _origCycle(id, push);
    U.fetchImported(function () { _origCycle(id, push); });
  };
})();
