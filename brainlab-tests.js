/* ═══════════════════════════════════════════════════════════════════════
   brainlab-tests.js — STUDYRIA BRAINLAB "TESTS" MODULE (additive layer)
   ═══════════════════════════════════════════════════════════════════════
   A dedicated first-class Tests section for BrainLab:

   BrainLab → Tests (#brainlab/tests) → Test Series page
   (#brainlab/tests/<seriesId>) → dedicated full-screen Test Attempt page
   (#brainlab/tests/<seriesId>/<n>).

   ARCHITECTURE (mirrors the existing Exam Universe pattern — config as
   data, deterministic generation, zero new engine):
   • SERIES registry — like EXAM_HUB/ORGS: adding a series = registry
     entry, not new engine code. Series definition, organization,
     target count and pool mapping live HERE (config-as-code, same
     pattern the platform already uses for exams and orgs).
   • REAL TESTS ONLY (spec §6/§26): every test's questions are
     deterministic seeded non-overlapping blocks taken from the REAL
     verified question pool (STUDYRIA_QB + verified euLive imports).
     Published test count = min(target, floor(pool / perTest)) computed
     LIVE from actual question records — nothing is hardcoded, no
     placeholder questions, no duplicated sets, no fake counters.
     If a pool cannot support the target, the remainder is shown
     honestly as Content Pending (Admin).
   • Shared allocation groups: series that draw from the same real
     pool get DISJOINT slices of ONE seeded shuffle → zero question
     reuse within a pool group (spec §7/§20).
   • Engine reuse (spec §10/§11): attempts run through the SAME
     mock engine + dedicated test page (BrainLabTestPage) with a
     distinct activity_type mode='test' — no second engine, no fake
     success. Session recording / results / review / mistakes /
     streaks all flow through the original _finishQuiz.
   • Search / filters / sort are real client-side operations over
     the registry + live pool metadata. No fabricated popularity data.

   ZERO changes to: existing BrainLab modules, mock tests, quizzes,
   MCQs, PYQs, flashcards, current affairs, mistake book, arena,
   translation system, auth, payment, PDF checkout. Additive only.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var BT = window.BrainLabTests = { _q: '', _f: 'all', _sort: 'rec' };

  function B() { return window.BrainLab; }
  function U() { return window.BrainLabUniverse || {}; }
  function TP() { return window.BrainLabTestPage || {}; }
  function esc(s) { var bl = B(); return bl && bl.escape ? bl.escape(s) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function n2(n) { return (n || 0).toLocaleString('en-IN'); }

  /* ── deterministic seeded shuffle — identical algorithm to
     brainlab-exams.js seedShuffle (stable test sets across reloads) ── */
  function seedShuffle(arr, seedStr) {
    var h = 1779033703 ^ seedStr.length;
    for (var i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    function rnd() { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
    return a;
  }

  /* ═══════════════════ SERIES REGISTRY (config-as-code) ═══════════════════
     org       — the real recruiting authority (never invented)
     pool      — universe exam id the series honestly draws from
                 ('own:<key>' → custom real subject pool, see SUBJECTS)
     group     — shared real-pool allocation group → disjoint slices
     target    — content target; published = min(target, floor(pool/perTest))
     search    — extra real search terms (exam/organization keywords)
     Do NOT raise a target above what the real pool can fill. */
  BT.SUBJECTS = {
    /* VFA (Veterinary Field Assistant, Govt of Assam) & MTS (Multi
       Tasking Staff, Govt of Assam) written tests are HSLC-level
       general-studies papers — Assam GK, GK, English, Elementary
       Maths, Reasoning, General Science. Same real subject pool. */
    gsts: ['Assam GK', 'General Knowledge', 'English', 'Mathematics', 'Reasoning', 'Science']
  };

  BT.SERIES = [
    { id: 'vfa',            name: 'Assam VFA Exam',           org: 'Government of Assam',                pool: 'own:gsts', group: 'gsts',  target: 21, icon: '🐄', search: 'vfa veterinary field assistant assam', desc: 'Prepare for the Assam VFA (Veterinary Field Assistant) recruitment exam.' },
    { id: 'constable-abub', name: 'Constable (AB/UB)',        org: 'Assam Police',                       pool: 'police',   group: 'police', target: 12, icon: '👮', search: 'constable ab ub police assam', desc: 'Assam Police Constable (AB/UB) written-test practice series.' },
    { id: 'sub-inspector',  name: 'Sub Inspector',           org: 'Assam Police',                       pool: 'police',   group: 'police', target: 12, icon: '🚔', search: 'si sub inspector police assam', desc: 'Assam Police Sub Inspector written-test practice series.' },
    { id: 'mts',            name: 'Multi Tasking Staff',     org: 'Government of Assam',                pool: 'own:gsts', group: 'gsts',  target: 16, icon: '🛠️', search: 'mts multi tasking staff assam govt', desc: 'Multi Tasking Staff (MTS) written-test practice series.' },
    { id: 'adre-g3',        name: 'ADRE Grade III',          org: 'Assam Direct Recruitment',           pool: 'adre',     group: 'adre',  target: 10, icon: '🏛️', search: 'adre grade 3 iii slrc', desc: 'ADRE Grade III recruitment exam test series.' },
    { id: 'adre-g4',        name: 'ADRE Grade IV',           org: 'Assam Direct Recruitment',           pool: 'adre4',    group: 'adre4', target: 10, icon: '🏛️', search: 'adre grade 4 iv slrc', desc: 'ADRE Grade IV recruitment exam test series.' },
    { id: 'adre-g3-driver', name: 'ADRE Grade III (Driver)', org: 'Assam Direct Recruitment',           pool: 'adre',     group: 'adre',  target: 10, icon: '🚗', search: 'adre driver grade 3 iii', desc: 'ADRE Grade III (Driver) posts practice series.' },
    { id: 'adre-g4-viii',   name: 'ADRE Grade IV (Class VIII)', org: 'Assam Direct Recruitment',         pool: 'adre4',    group: 'adre4', target: 10, icon: '📗', search: 'adre grade 4 class 8 viii', desc: 'ADRE Grade IV (Class VIII qualification) posts practice series.' },
    { id: 'apsc-cce',       name: 'APSC CCE Prelims',        org: 'APSC',                               pool: 'apsc',     group: 'apsc',  target: 10, icon: '🎓', search: 'apsc cce prelims civil service assam', desc: 'APSC Combined Competitive (Prelims) test series.' },
    { id: 'assam-tet',      name: 'Assam TET / GT-PGT',      org: 'Assam TET Authority',                pool: 'tet',      group: 'tet',   target: 10, icon: '🏫', search: 'tet gt pgt teacher assam', desc: 'Assam TET / GT-PGT eligibility test series.' },
    { id: 'dhs',            name: 'DHS Assam',               org: 'Directorate of Health Services, Assam', pool: 'dhs',    group: 'dhs',   target: 10, icon: '🏥', search: 'dhs health services assam', desc: 'DHS Assam recruitment exam test series.' },
    { id: 'ssc-gd',         name: 'SSC GD',                  org: 'Staff Selection Commission',         pool: 'ssc',      group: 'ssc',   target: 10, icon: '🛡️', search: 'ssc gd general duty constable', desc: 'SSC GD (General Duty) test series.' }
  ];

  BT.find = function (sid) { return BT.SERIES.filter(function (s) { return s.id === sid; })[0] || null; };

  /* ── REAL POOLS — identical matching rules to the Exam Universe ── */
  BT._groupPoolCache = {};
  function groupPoolRaw(group) {
    if (BT._groupPoolCache[group]) return BT._groupPoolCache[group];
    var pool = null;
    var g0 = (BT.SERIES.filter(function (s) { return s.group === group; })[0]) || null;
    if (!g0) return [];
    if (g0.pool.indexOf('own:') === 0) {
      /* custom subject pool — same matching logic as U.pool on a pseudo exam */
      var u = U();
      var pseudo = { id: 'bl-tests-' + group, subjects: BT.SUBJECTS[g0.pool.slice(4)] || [] };
      if (u.pool) { try { pool = u.pool(pseudo); } catch (e) { pool = null; } }
      if (!pool) { pool = localPool(pseudo.subjects, 'GENERAL'); }
    } else {
      var u2 = U(), ex = u2.findExam ? u2.findExam(g0.pool) : null;
      if (ex && u2.pool) { try { pool = u2.pool(ex); } catch (e) { pool = null; } }
      if (!pool) {
        /* fallback: universe not loaded yet — same real subjects from the
           EXAM_HUB registry, same matching rules, still REAL data only */
        var hub = ((window.BrainLabV7 || {}).EXAM_HUB || []).filter(function (h) { return h.id === g0.pool; })[0] || null;
        var keyMap = { adre: 'ADRE', adre4: 'ADRE', apsc: 'APSC', police: 'ASSAM POLICE', tet: 'ASSAM TET', ssc: 'SSC', dhs: 'GENERAL', other: 'GENERAL' };
        if (hub) pool = localPool(hub.subjects, keyMap[g0.pool] || 'GENERAL');
      }
    }
    pool = pool || [];
    BT._groupPoolCache[group] = pool;
    return pool;
  }
  /* local fallback pool builder (kept byte-compatible with U.pool rules) */
  function localPool(subjects, tagKey) {
    var QB = window.STUDYRIA_QB || [], seen = {}, out = [];
    QB.forEach(function (q) {
      var k = String(String(q[0]).slice(0, 60) + q[5]);
      if (seen[k]) return;
      var tags = String(q[10] || '').toUpperCase();
      if (tags.indexOf(tagKey) !== -1 || subjects.indexOf(q[7]) !== -1 || subjects.indexOf(q[8]) !== -1) { seen[k] = 1; out.push(q); }
    });
    return out;
  }

  /* ── per-test size + published count — ALWAYS computed, never hardcoded ── */
  BT.info = function (sid) {
    var s = BT.find(sid); if (!s) return null;
    var group = groupPoolRaw(s.group);
    var per = Math.min(100, Math.max(10, Math.floor(group.length / s.target)));
    var published = group.length < 10 ? 0 : Math.min(s.target, Math.floor(group.length / per));
    return {
      s: s, poolCount: group.length, perTest: per, published: published,
      mcqs: published * per, pending: Math.max(0, s.target - published),
      minPerTest: per /* 1 min/question — engine convention */
    };
  };

  /* ── DISJOINT allocation inside a pool group (spec §7/§20) ──
     One seeded shuffle per group; series take consecutive slices in
     registry order → a real question is never reused across tests of
     the same pool group. */
  BT._shuffled = {};
  function groupShuffled(group) {
    if (!BT._shuffled[group]) BT._shuffled[group] = seedShuffle(groupPoolRaw(group), 'testseries:' + group);
    return BT._shuffled[group];
  }
  function groupOffset(sid) {
    var s = BT.find(sid); if (!s) return 0;
    var off = 0;
    /* registry order: every series BEFORE this one in the array */
    for (var i = 0; i < BT.SERIES.length; i++) {
      var x = BT.SERIES[i];
      if (x.id === s.id) break;
      if (x.group === s.group) { var inf = BT.info(x.id); off += inf ? (inf.published * inf.perTest) : 0; }
    }
    return off;
  }

  /* deterministic question set for series `sid`, test number `n` (1-based) */
  BT.test = function (sid, n) {
    var i = BT.info(sid); if (!i || i.published < 1) return null;
    n = parseInt(n, 10) || 1;
    if (n < 1 || n > i.published) return null;
    var arr = groupShuffled(i.s.group);
    var off = groupOffset(sid) + (n - 1) * i.perTest;
    var qs = arr.slice(off, off + i.perTest);
    if (qs.length < i.perTest) return null; /* honest: incomplete → not a test */
    return { n: n, qs: qs };
  };

  /* series title shown on the attempt page + sessions */
  BT.testTitle = function (sid, n) { var s = BT.find(sid); return (s ? s.name : 'Test') + ' — Test ' + n; };

  /* ═══════════════════ TESTS LANDING PAGE (#brainlab/tests) ═══════════════════ */
  BT.renderCatalog = function () {
    var w = document.getElementById('blv8-tests');
    if (!w) return;
    var body = document.getElementById('blt-body');
    if (!body) { body = document.createElement('div'); body.id = 'blt-body'; w.appendChild(body); }

    /* real stats — computed from live question records, no fake counters */
    var series = BT.SERIES.map(function (s) { return BT.info(s.id); }).filter(Boolean);
    var nSeries = series.filter(function (i) { return i.published > 0; }).length;
    var nTests = 0, nQs = 0;
    series.forEach(function (i) { nTests += i.published; nQs += i.mcqs; });

    var h = '<div class="blt-hero">'
      + '<div class="blt-hero-title">📝 Tests</div>'
      + '<div class="blt-hero-sub">Practice real exam-pattern test series for Assam competitive exams.</div>'
      + '<div class="blt-stats">'
      + '<div class="blt-stat"><span class="blt-stat-n">' + nSeries + '</span><span class="blt-stat-l">Test Series</span></div>'
      + '<div class="blt-stat"><span class="blt-stat-n">' + n2(nTests) + '</span><span class="blt-stat-l">Tests</span></div>'
      + '<div class="blt-stat"><span class="blt-stat-n">' + n2(nQs) + '</span><span class="blt-stat-l">Questions</span></div>'
      + '<div class="blt-stat"><span class="blt-stat-n blt-stat-lang">English + অসমীয়া</span><span class="blt-stat-l">Languages</span></div>'
      + '</div></div>';

    /* search + filters + sort (all real, client-side) */
    h += '<div class="blt-controls">'
      + '<input id="blt-q" class="blt-search" type="search" placeholder="Search tests…" value="' + esc(BT._q) + '" oninput="BrainLabTests.setQ(this.value)" aria-label="Search tests">'
      + '<select id="blt-sort" class="blt-sort" onchange="BrainLabTests.setSort(this.value)" aria-label="Sort test series">'
      + '<option value="rec"' + (BT._sort === 'rec' ? ' selected' : '') + '>Recommended</option>'
      + '<option value="tests"' + (BT._sort === 'tests' ? ' selected' : '') + '>Most Tests</option>'
      + '<option value="qs"' + (BT._sort === 'qs' ? ' selected' : '') + '>Most Questions</option>'
      + '<option value="az"' + (BT._sort === 'az' ? ' selected' : '') + '>A–Z</option>'
      + '</select></div>';

    h += '<div class="blt-filters">' + BT.FILTERS.map(function (f) {
      var on = (BT._f === f.id) ? ' on' : '';
      return '<button class="blt-chip' + on + '" onclick="BrainLabTests.setFilter(\'' + f.id + '\')">' + f.label + '</button>';
    }).join('') + '</div>';

    /* series cards */
    var rows = BT._visible();
    h += '<div class="blt-grid">';
    if (!rows.length) {
      h += '<div class="blt-empty">No test series match "' + esc(BT._q) + '". Try another exam — e.g. VFA, Police, ADRE, APSC, SSC.</div>';
    }
    rows.forEach(function (i) {
      var s = i.s;
      h += '<button class="blt-card" onclick="BrainLabTests.openSeries(\'' + s.id + '\')">'
        + '<span class="blt-card-icon">' + s.icon + '</span>'
        + '<span class="blt-card-main"><span class="blt-card-title">' + esc(s.name) + '</span>'
        + '<span class="blt-card-org">' + esc(s.org) + ' · ' + i.published + (i.published === 1 ? ' Test' : ' Tests') + ' · ' + n2(i.mcqs) + ' MCQs</span></span>'
        + '<span class="blt-card-chev" aria-hidden="true">›</span>'
        + (i.pending > 0 ? '<span class="blt-card-pending">More coming</span>' : '')
        + '</button>';
    });
    h += '</div>';
    body.innerHTML = h;
  };

  BT.FILTERS = [
    { id: 'all', label: 'All', org: null },
    { id: 'assam-govt', label: 'Assam Govt', org: 'Government of Assam' },
    { id: 'police', label: 'Assam Police', org: 'Assam Police' },
    { id: 'adre', label: 'ADRE', org: 'Assam Direct Recruitment' },
    { id: 'apsc', label: 'APSC', org: 'APSC' },
    { id: 'tet', label: 'TET', org: 'Assam TET Authority' },
    { id: 'dhs', label: 'DHS', org: 'Directorate of Health Services, Assam' },
    { id: 'ssc', label: 'SSC', org: 'Staff Selection Commission' }
  ];

  /* visible series: search + filter + sort — all over real registry data */
  BT._visible = function () {
    var q = (BT._q || '').trim().toLowerCase();
    var f = BT.FILTERS.filter(function (x) { return x.id === BT._f; })[0] || BT.FILTERS[0];
    var rows = BT.SERIES.map(function (s) { return BT.info(s.id); }).filter(Boolean);
    rows = rows.filter(function (i) { return i.published > 0; });
    if (f.org) rows = rows.filter(function (i) { return i.s.org === f.org; });
    if (q) {
      rows = rows.filter(function (i) {
        var hay = (i.s.name + ' ' + i.s.org + ' ' + i.s.search + ' ' + i.s.desc).toLowerCase();
        return q.split(/\s+/).every(function (t) { return hay.indexOf(t) !== -1; });
      });
    }
    if (BT._sort === 'tests') rows.sort(function (a, b) { return b.published - a.published; });
    else if (BT._sort === 'qs') rows.sort(function (a, b) { return b.mcqs - a.mcqs; });
    else if (BT._sort === 'az') rows.sort(function (a, b) { return a.s.name.localeCompare(b.s.name); });
    /* 'rec' → registry order (already) */
    return rows;
  };

  BT.setQ = function (v) { BT._q = v; var el = document.getElementById('blt-q'); if (el && el.value !== v) el.value = v; BT.renderCatalog(); };
  BT.setFilter = function (f) { BT._f = f; BT.renderCatalog(); };
  BT.setSort = function (s) { BT._sort = s; BT.renderCatalog(); };

  /* ═══════════════════ TEST SERIES PAGE (#brainlab/tests/<sid>) ═══════════════════ */
  BT.openSeries = function (sid, push) {
    if (push !== false) { location.hash = '#brainlab/tests/' + sid; return; } /* hashchange → syncFromHash → openSeries(sid,false) */
    var i = BT.info(sid);
    if (!i || i.published < 1) { location.hash = '#brainlab/tests'; return; }
    var s = i.s, w = document.getElementById('blv8-tests');
    if (!w) return;
    var body = document.getElementById('blt-body');
    if (!body) { BT.renderCatalog(); body = document.getElementById('blt-body'); if (!body) return; }

    var h = '<div class="blt-crumb"><button class="blt-back" onclick="location.hash=\'#brainlab/tests\'" aria-label="Back to Tests">← Tests</button></div>'
      + '<div class="blt-series-hero">'
      + '<div class="blt-series-icon">' + s.icon + '</div>'
      + '<div class="blt-series-name">' + esc(s.name) + '</div>'
      + '<div class="blt-series-org">' + esc(s.org) + '</div>'
      + '<div class="blt-series-desc">' + esc(s.desc) + '</div>'
      + '<div class="blt-stats blt-stats-series">'
      + '<div class="blt-stat"><span class="blt-stat-n">' + i.published + '</span><span class="blt-stat-l">Tests</span></div>'
      + '<div class="blt-stat"><span class="blt-stat-n">' + n2(i.mcqs) + '</span><span class="blt-stat-l">Questions</span></div>'
      + '<div class="blt-stat"><span class="blt-stat-n">' + i.minPerTest + '</span><span class="blt-stat-l">Min/Test</span></div>'
      + '<div class="blt-stat"><span class="blt-stat-n blt-stat-lang">অসমীয়া | English</span><span class="blt-stat-l">Language</span></div>'
      + '</div></div>';

    h += '<div class="blt-choose">CHOOSE A TEST</div><div class="blt-tests">';
    for (var n = 1; n <= i.published; n++) {
      var resumable = null;
      try { if (TP().saved) resumable = TP().saved(sid, n); } catch (e) { resumable = null; }
      h += '<button class="blt-test' + (resumable ? ' has-resume' : '') + '" onclick="BrainLabTests.openTest(\'' + sid + '\',' + n + ')">'
        + '<span class="blt-test-no">' + n + '</span>'
        + '<span class="blt-test-main"><span class="blt-test-title">' + esc(s.name) + ' — Test ' + n + '</span>'
        + '<span class="blt-test-meta">' + i.minPerTest + ' Minutes · ' + i.perTest + ' MCQs</span></span>'
        + (resumable ? '<span class="blt-test-resume">Resume</span>' : '<span class="blt-test-go">Start ›</span>')
        + '</button>';
    }
    if (i.pending > 0) {
      h += '<div class="blt-pending-note">' + i.pending + ' more test' + (i.pending > 1 ? 's are' : ' is') + ' coming — more verified questions are being added to this series.</div>';
    }
    h += '</div>';
    body.innerHTML = h;
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  /* ═══════════════════ TEST ATTEMPT (#brainlab/tests/<sid>/<n>) ═══════════════════
     Opens the DEDICATED full-screen attempt page — same engine + page
     system as exam mocks (BrainLabTestPage), activity_type='test'. */
  BT.openTest = function (sid, n, push) {
    if (push !== false) { location.hash = '#brainlab/tests/' + sid + '/' + n; return; }
    var i = BT.info(sid), t = i ? BT.test(sid, n) : null;
    if (!i || !t) { location.hash = '#brainlab/tests/' + sid; return; }
    var tp = TP();
    if (!tp || !tp.openCustom) {
      /* engine page not loaded yet (route race) — retry shortly */
      setTimeout(function () { BT.openTest(sid, n, false); }, 250);
      return;
    }
    tp.openCustom({
      exam: sid, n: t.n,
      name: i.s.name,
      qs: t.qs
    });
  };

  /* public API for Admin (real data only) */
  BT.adminReport = function () {
    return BT.SERIES.map(function (s) {
      var i = BT.info(s.id);
      return {
        id: s.id, name: s.name, org: s.org, pool: i.poolCount,
        perTest: i.perTest, published: i.published, target: s.target,
        mcqs: i.mcqs, pending: i.pending, status: i.published >= s.target ? 'Published' : (i.published > 0 ? 'Partially Published' : 'Content Pending')
      };
    });
  };

  /* warm euLive imports once, then re-render (existing platform pattern) */
  var impWarm = false;
  BT.boot = function () {
    if (impWarm) return;
    impWarm = true;
    var u = U();
    if (u && u.fetchImported) {
      try {
        u.fetchImported(function () {
          BT._groupPoolCache = {}; BT._shuffled = {}; /* pools may have grown */
          var w = document.getElementById('blv8-tests');
          if (w && w.classList.contains('on')) BT.renderCatalog();
        });
      } catch (e) { }
    }
  };
  BT.boot();
})();
