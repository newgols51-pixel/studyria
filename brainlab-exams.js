/* ════════════════════════════════════════════════════════════════
   brainlab-exams.js — STUDYRIA EXAM UNIVERSE v2 (additive layer)
   ════════════════════════════════════════════════════════════════
   Complete per-exam preparation system — a discovery/organization
   layer OVER existing engines. No new engine, no checkout changes.
   • Mock series: 10 distinct exam-style mocks derived from the REAL
     question pool (deterministic, non-overlapping allocation).
   • PYQ: real bank PYQs + admin-imported verified questions
     (bl_exam_questions, additive table) with year/subject practice.
   • Papers/Study PDFs → canonical openDetail(id). CA → existing V7.
   • Progress/Weak areas/Continue → user's OWN bl_sessions only.
   Every displayed count comes from real records — nothing hardcoded.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function B() { return window.BrainLab; }
  function V7() { return window.BrainLabV7 || {}; }
  var U = window.BrainLabUniverse = { _imp: {}, _impAt: 0 };

  function esc(s) { var bl = B(); return bl ? bl.escape(s) : String(s == null ? '' : s); }
  function examKey(id) { return { adre: 'ADRE', adre4: 'ADRE', apsc: 'APSC', police: 'Assam Police', tet: 'Assam TET', ssc: 'SSC', dhs: 'General', other: 'General' }[id] || 'General'; }
  function examTerms(id) { return { adre: ['adre'], adre4: ['adre'], apsc: ['apsc'], police: ['assam police', 'police'], tet: ['assam tet', 'tet'], ssc: ['ssc'], dhs: ['dhs'], other: [] }[id] || []; }
  function hub() { return (V7().EXAM_HUB || []); }
  function findExam(id) { return hub().filter(function (e) { return e.id === id; })[0]; }
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
    var p = U.pool(e).filter(function (q) { return String(q[17] || '').toUpperCase() === 'PYQ'; });
    return p;
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

  /* imported verified questions from the additive bl_exam_questions table */
  U.fetchImported = function (cb) {
    var now = Date.now();
    if (U._impAt && now - U._impAt < 600000) { cb && cb(); return; }
    if (U._impPending) { U._impCbs.push(cb); return; } /* one in-flight fetch, queue callbacks */
    var sb = window.supabase || window.supabaseClient;
    if (!sb) { U._impAt = now; cb && cb(); return; }
    U._impPending = true; U._impCbs = [cb];
    function done() { U._impPending = false; U._impAt = Date.now(); (U._impCbs || []).forEach(function (f) { f && f(); }); U._impCbs = []; }
    sb.from('bl_exam_questions').select('*').eq('verified', true).eq('status', 'active').limit(2000)
      .then(function (res) {
        U._imp = {};
        ((res && res.data) || []).forEach(function (r) {
          var ex = r.exam_id || 'other';
          if (!U._imp[ex]) U._imp[ex] = { rows: [], meta: [] };
          U._imp[ex].rows.push([
            r.question_text, r.opt_a, r.opt_b, r.opt_c, r.opt_d, (r.answer || 'a').toLowerCase(),
            r.explanation || '', r.subject || 'General Knowledge', r.topic || 'General', r.difficulty || 'medium',
            r.exam_id || '', '', r.opt_a_as || '', r.opt_b_as || '', r.opt_c_as || '', r.opt_d_as || '',
            '', r.is_pyq ? 'PYQ' : 'MCQ', (r.source_name || '') + (r.source_year ? ' ' + r.source_year : '')
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

  /* ═══ MOCK SERIES — 10 distinct exam-style mocks from the REAL pool ═══ */
  U.mockSeries = function (e) {
    var pool = U.pool(e);
    var blocks = Math.min(10, Math.max(1, Math.floor(pool.length / 10)));
    if (pool.length < 10) return [];
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
  U.startMockN = function (examId, n) {
    var e = findExam(examId); if (!e) return;
    var m = U.mockSeries(e).filter(function (x) { return x.n === n; })[0];
    var bl = B(); if (!bl || !m) return;
    bl.showCountPicker({ title: e.name + ' — Full Mock ' + (n < 10 ? '0' + n : n), category: 'All', pool: m.qs, mode: 'mock' });
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

  /* ═════════ LANDING — #brainlab/exams ═════════ */
  U.renderLanding = function () {
    var c = document.getElementById('bl-sec-exams-body'); if (!c) return;
    var QB = window.STUDYRIA_QB || [];
    var pyqAll = 0, seen = {};
    QB.forEach(function (q) { var k = String(String(q[0]).slice(0, 60) + q[5]); if (!seen[k]) { seen[k] = 1; if (String(q[17]).toUpperCase() === 'PYQ') pyqAll++; } });
    var impPyq = 0; Object.keys(U._imp).forEach(function (k) { impPyq += (U._imp[k].rows || []).filter(function (r) { return r[17] === 'PYQ'; }).length; });
    var stats = [
      ['🎯', 'Exams', hub().length],
      ['📝', 'Mock Tests', (window.SM || []).length],
      ['🧩', 'Questions', Object.keys(seen).length + Object.keys(U._imp).reduce(function (a, k) { return a + (U._imp[k].rows || []).length; }, 0)],
      ['📚', 'PYQs', pyqAll + impPyq]
    ];
    var pdfN = (window.PDFS || []).filter(function (p) { return p && p.title; }).length;
    if (pdfN) stats.push(['📄', 'Study PDFs', pdfN]);

    var h = '<div class="bl-eu-hero"><div class="bl-eu-h-title">🎯 Exam Universe</div>'
      + '<div class="bl-eu-h-sub">Everything you need to prepare for your exam — tests, PYQs, papers, practice and study resources in one place.</div>'
      + '<div class="bl-eu-stats">';
    stats.forEach(function (s) { h += '<div class="bl-eu-stat"><span class="bl-eu-stat-ic">' + s[0] + '</span><span class="bl-eu-stat-n">' + s[2].toLocaleString() + '</span><span class="bl-eu-stat-l">' + s[1] + '</span></div>'; });
    h += '</div><input type="search" class="bl-eu-search" id="bl-eu-search" placeholder="Search exams…" aria-label="Search exams"></div>'
      + '<div class="bl-eu-grid" id="bl-eu-grid"></div>';
    c.innerHTML = h;
    U._renderGrid('');
    var inp = document.getElementById('bl-eu-search');
    if (inp) inp.addEventListener('input', function () { U._renderGrid(inp.value); });
  };

  U._renderGrid = function (q) {
    var g = document.getElementById('bl-eu-grid'); if (!g) return;
    q = String(q || '').toLowerCase().trim();
    var rows = hub().map(function (e) {
      return { e: e, n: U.pool(e).length, pyq: U.pyqPool(e).length, mocks: U.mockSeries(e).length, pdfs: examPDFs(e).length };
    });
    if (q) rows = rows.filter(function (r) { return (r.e.name + ' ' + r.e.desc + ' ' + r.e.subjects.join(' ')).toLowerCase().indexOf(q) !== -1; });
    if (!rows.length) { g.innerHTML = '<div class="bl-eu-empty">No exams match “' + esc(q) + '”.</div>'; return; }
    var h = '';
    rows.sort(function (a, b) { return b.n - a.n; }).forEach(function (r) {
      var e = r.e;
      h += '<div class="bl-eu-card" onclick="BrainLabUniverse.openExam(\'' + e.id + '\', true)">'
        + '<div class="bl-eu-card-top"><span class="bl-eu-card-ic">🎯</span><div><div class="bl-eu-card-name">' + esc(e.name) + '</div>'
        + '<div class="bl-eu-card-desc">' + esc(e.desc) + '</div></div><span class="bl-eu-arrow">›</span></div>'
        + '<div class="bl-eu-card-stats">'
        + '<span>' + r.n.toLocaleString() + ' questions</span>'
        + (r.pyq ? '<span>' + r.pyq + ' PYQ' + (r.pyq === 1 ? '' : 's') + '</span>' : '')
        + (r.mocks ? '<span>' + r.mocks + ' mock' + (r.mocks === 1 ? '' : 's') + '</span>' : '')
        + (r.pdfs ? '<span>' + r.pdfs + ' PDF' + (r.pdfs === 1 ? '' : 's') + '</span>' : '')
        + '</div><div class="bl-eu-card-sub">' + esc(e.subjects.slice(0, 4).join(' · ')) + '</div></div>';
    });
    g.innerHTML = h;
  };

  /* ═════════ DETAIL — #brainlab/exams/<id> ═════════ */
  U.openExam = function (id, push) {
    var e = findExam(id); if (!e) { U.renderLanding(); return; }
    if (push !== false) { location.hash = '#brainlab/exams/' + id; return; }
    var bl = B(); if (!bl) return;
    var c = document.getElementById('bl-sec-exams-body'); if (!c) return;

    var pool = U.pool(e), pyq = U.pyqPool(e), mocks = U.mockSeries(e), key = examKey(id);
    var sess = (bl.getSessions() || []).filter(function (s) { return s.exam === key; });
    U._e = e; U._pyqPool = pyq; U._mocks = mocks;

    var h = '<button class="bl-eu-back" onclick="BrainLabUniverse.back()">← Exam Universe</button>';
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
      + '</div></div>';

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
    }
    h += '<div class="bl-eu-continue"><div><div class="bl-eu-card-name">⚡ Today\'s ' + esc(e.name) + ' Practice</div>'
      + '<div class="bl-eu-card-desc">10 exam-focused questions, fresh every day</div></div>'
      + (dailyDone ? '<span class="bl-eu-done">✓ Done today</span>'
        : '<button class="bl-eu-btn" onclick="BrainLabUniverse.startDaily(\'' + e.id + '\')">START</button>')
      + '</div></div>';

    /* ── Mock Tests: 10 distinct mocks from real pool ── */
    h += '<div class="bl-eu-sec" id="bl-eu-sec-tests"><div class="bl-eu-sec-t">📝 Mock Tests</div>'
      + '<div class="bl-eu-sec-s">' + mocks.length + ' distinct full mocks — each built from a unique, non-overlapping set of the ' + pool.length.toLocaleString() + '-question real pool. Timed 1 min/question, auto-submit, review & analytics.</div>';
    if (mocks.length) {
      h += '<div class="bl-eu-mocks">';
      mocks.forEach(function (m) {
        var nn = m.n < 10 ? '0' + m.n : m.n;
        h += '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">Full Mock ' + nn + '</div>'
          + '<div class="bl-eu-card-desc">' + m.qs.length + ' questions · ' + m.qs.length + ' min · exam-style</div></div>'
          + '<button class="bl-eu-btn" onclick="BrainLabUniverse.startMockN(\'' + e.id + '\',' + m.n + ')">START</button></div>';
      });
      h += '</div>';
    } else {
      h += '<div class="bl-eu-empty">Not enough questions in this exam pool yet to build a mock series.</div>';
    }
    h += '</div>';

    /* ── Quick Practice ── */
    h += '<div class="bl-eu-quick" id="bl-eu-sec-quick"><div class="bl-eu-sec-t">⚡ Quick Practice</div>'
      + '<div class="bl-eu-card-desc">Have a few minutes? Start a quick exam-focused session.</div>'
      + '<div class="bl-eu-quick-btns">'
      + [10, 25, 50].map(function (k) { return '<button class="bl-eu-btn" onclick="BrainLab.startQuizSession({mode:\'quiz\',title:\'' + esc(e.name) + ' Quick ' + k + '\',questions:' + k + ',exam:\'' + key + '\'})">QUICK ' + k + '</button>'; }).join('')
      + '</div></div>';

    /* ── PYQ Practice ── */
    h += '<div class="bl-eu-sec" id="bl-eu-sec-pyq"><div class="bl-eu-sec-t">📚 PYQ Practice</div>';
    if (pyq.length) {
      var yrs = pyqYears(pyq), subs = pyqSubjects(pyq);
      h += '<div class="bl-eu-sec-s">' + pyq.length + ' verified PYQ' + (pyq.length === 1 ? '' : 's') + ' mapped to this exam'
        + (yrs.length ? ' · Years: ' + yrs.join(', ') : '') + '</div>'
        + '<div class="bl-eu-btns2" style="margin-bottom:8px">'
        + '<button class="bl-eu-btn" onclick="BrainLabUniverse.startPyq(0)">PRACTICE ALL</button>'
        + '<button class="bl-eu-btn bl-eu-btn2" onclick="BrainLabPages.go(\'pyq\')">PYQ HUB</button></div>';
      if (yrs.length > 1) {
        U._pyqYears = yrs;
        h += '<div class="bl-eu-mini">By year:</div><div class="bl-eu-chips">' + yrs.map(function (y, i) { return '<button onclick="BrainLabUniverse.startPyqYear(' + i + ')">' + y + '</button>'; }).join('') + '</div>';
      }
      if (subs.length > 1) {
        U._pyqSubs = subs;
        h += '<div class="bl-eu-mini">By subject:</div><div class="bl-eu-chips">' + subs.map(function (s2, i) { return '<button onclick="BrainLabUniverse.startPyqSub(' + i + ')">' + esc(s2) + '</button>'; }).join('') + '</div>';
      }
    } else {
      h += '<div class="bl-eu-empty">No PYQs verified for this exam yet — the PYQ bank is growing. Admins can import verified PYQs via Admin → BrainLab Manager.</div>';
    }
    h += '</div>';

    /* ── Question Papers + Study Materials (async canonical PDF flow) ── */
    h += '<div class="bl-eu-sec" id="bl-eu-sec-papers"><div class="bl-eu-sec-t">📄 Previous Year Question Papers</div>'
      + ((e.id === 'adre' || e.id === 'adre4') ? '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">🏛️ ADRE Official Previous Year Papers</div><div class="bl-eu-card-desc">Verified official papers with answer keys — full practice page</div></div><button class="bl-eu-btn" onclick="navigate(\'adre-papers\')">OPEN</button></div>' : '')
      + '<div class="bl-eu-empty" id="bl-eu-papers-body">Loading…</div></div>';
    h += '<div class="bl-eu-sec" id="bl-eu-sec-mats"><div class="bl-eu-sec-t">📚 Study Materials</div><div class="bl-eu-empty" id="bl-eu-mats-body">Loading…</div></div>';

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

    /* ── Current Affairs ── */
    h += '<div class="bl-eu-sec" id="bl-eu-sec-ca"><div class="bl-eu-sec-t">📰 Current Affairs</div>'
      + '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">Stay exam-ready</div>'
      + '<div class="bl-eu-card-desc">Daily published affairs — quiz built from real updates</div></div>'
      + '<div class="bl-eu-btns2"><button class="bl-eu-btn" onclick="BrainLabV7.startAffairsQuiz()">QUIZ</button>'
      + '<button class="bl-eu-btn bl-eu-btn2" onclick="BrainLabPages.go(\'current-affairs\')">VIEW ALL</button></div></div></div>';

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

    /* ── Exam Pattern (honest — only when admin publishes) ── */
    h += '<div class="bl-eu-sec"><div class="bl-eu-sec-t">📝 Exam Pattern</div><div class="bl-eu-empty">Official pattern data has not been published for this exam yet. Verified details will appear here.</div></div>';

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
      h += '<div class="bl-eu-testrow"><div><div class="bl-eu-card-name">📝 Full Mock 01</div>'
        + '<div class="bl-eu-card-desc">' + mocks[0].qs.length + '-question exam-style mock</div></div>'
        + '<button class="bl-eu-btn" onclick="BrainLabUniverse.startMockN(\'' + e.id + '\',1)">START</button></div>';
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
      + '<div><span class="bl-eu-ab-l">Focus</span> ' + esc(e.desc) + '</div>'
      + '<div><span class="bl-eu-ab-l">Subjects</span> ' + esc(e.subjects.join(', ')) + '</div></div></div>';

    c.innerHTML = h;
    U._loadPDFs(e);
    var top = document.getElementById('blv8-exams');
    if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  U._to = function (id) { var el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  /* ── PYQ starters (pool injection → existing engine) ── */
  U.startPyq = function (mode) {
    var bl = B(); if (!bl || !U._pyqPool || !U._pyqPool.length) return;
    bl.showCountPicker({ title: (U._e ? U._e.name : '') + ' PYQ Practice', category: 'All', pool: U._pyqPool, mode: 'pyq' });
  };
  U.startPyqYear = function (i) {
    var y = (U._pyqYears || [])[i]; var bl = B(); if (!bl) return;
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
      var pb = document.getElementById('bl-eu-papers-body'), mb = document.getElementById('bl-eu-mats-body');
      if (pb) pb.innerHTML = papers.length ? papers.map(cardHTML).join('') : '<div class="bl-eu-empty">No question papers published yet.</div>';
      if (mb) mb.innerHTML = mats.length ? mats.map(cardHTML).join('') : '<div class="bl-eu-empty">No study materials published yet.</div>';
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
  U.back = function () { location.hash = '#brainlab/exams'; };
  U.practiceSubject = function (i) {
    var bl = B(), r = (U._subjRows || [])[i]; if (!bl || !r) return;
    bl.showCountPicker({ title: r.s, category: r.s, pool: bl.filterQuestions({ category: r.s }), mode: 'quiz' });
  };
  U.practiceCategory = function (cat) {
    var bl = B(); if (!bl) return;
    bl.showCountPicker({ title: cat, category: cat, pool: bl.filterQuestions({ category: cat }), mode: 'quiz' });
  };

  /* boot: refresh imported questions when BrainLab route opens */
  var _origRenderLanding = U.renderLanding;
  U.renderLanding = function () { U.fetchImported(function () { _origRenderLanding(); }); };
  var _origOpen = U.openExam;
  U.openExam = function (id, push) {
    if (push !== false) return _origOpen(id, push);
    U.fetchImported(function () { _origOpen(id, push); });
  };
})();
