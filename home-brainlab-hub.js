/* ═══════════════════════════════════════════════════════════════════════════
   STUDYRIA HOMEPAGE — BRAINLAB LEARNING HUB  (Sep 2026 homepage restructure)
   ═══════════════════════════════════════════════════════════════════════════
   Renders the homepage BrainLab hub (9 vertical sections × 4 full-width cards)
   into #sv2BrainLabHub (created by studyria-home-v2.js injectSections).

   STRICT REAL-DATA RULES (owner spec §4/§7/§12):
     • ZERO hardcoded counts. Every number on a card is computed at runtime
       from the real production question bank (window.STUDYRIA_QB via the
       BrainLab bundle), BrainLabTests.info() live test counts, or real
       device activity (streak / daily status).
     • No skeleton placeholders, no infinite loading, no fake fallbacks.
       Cards render immediately (title + description only); real counts fill
       in once the BrainLab bundle has loaded in the background.
     • Cards/sections with NO real data are removed/hidden (fail-closed).
     • "View All" and card clicks reuse the existing production BrainLab
       routes (#brainlab/<module>, brainlab-pages.js V8 sub-router) and the
       existing launch flows (BrainLab.* / BrainLabTests.* / BrainLabV7.*).
       No engine is duplicated or modified.
   Additive layer: this file renders presentation on the homepage only.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window._hbhHubLoaded) return;
  window._hbhHubLoaded = true;

  var HBH = {};
  window.HBH = HBH;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function n2(x) { x = Number(x) || 0; return x.toLocaleString('en-IN'); }

  /* wait until every dependency global exists, then run fn (poll ≤ 90s —
     the lazy BrainLab bundle is ~500KB gzipped and may still be downloading) */
  HBH._wait = function (deps, fn, timeout) {
    timeout = timeout || 90000;
    var t0 = Date.now();
    (function t() {
      for (var i = 0; i < deps.length; i++) if (!window[deps[i]]) {
        if (Date.now() - t0 > timeout) return;
        return setTimeout(t, 200);
      }
      try { fn(); } catch (e) { console.warn('[hbh] ready handler failed', e); }
    })();
  };

  /* ═══════════ CARD DESTINATIONS (existing production flows only) ═══════════ */

  /* View All → dedicated module page (#brainlab/<module> V8 sub-route) */
  HBH.view = function (module) { navigate('brainlab/' + module); };
  /* Daily Practice → its own dedicated page (brainlab-pages.js PAGES.daily) */
  HBH.viewDaily = function () { HBH.view('daily'); };

  HBH.examCard = function (orgId) {
    navigate('brainlab/exams');
    HBH._wait(['BrainLab', 'BrainLabUniverse'], function () {
      if (window.BrainLabUniverse.openOrg) window.BrainLabUniverse.openOrg(orgId, true);
    });
  };
  HBH.testCard = function (sid) {
    navigate('brainlab/tests');
    HBH._wait(['BrainLab', 'BrainLabTests'], function () {
      window.BrainLabTests.openSeries(sid, true);
    });
  };
  HBH.mockCard = function (exam, title) {
    navigate('brainlab/mock-tests');
    HBH._wait(['BrainLab'], function () {
      window.BrainLab.startPickedMock(exam, title);
    });
  };
  HBH.quizCard = function (qid) {
    navigate('brainlab/quizzes');
    HBH._wait(['BrainLab'], function () { window.BrainLab.startCategoryQuiz(qid); });
  };
  HBH.pyqCard = function (exam) {
    navigate('brainlab/pyq');
    HBH._wait(['BrainLab', 'BrainLabV7'], function () {
      window.BrainLabV7.startExamPYQ(exam);
    });
  };
  HBH.mcqCard = function (cat) {
    navigate('brainlab/mcqs');
    HBH._wait(['BrainLab'], function () {
      window.BrainLab.startQuizSession({
        mode: 'quiz', title: cat + ' Practice', questions: 20, category: cat
      });
    });
  };
  HBH.subjCard = function (slug, cat) {
    navigate('brainlab/subjects');
    HBH._wait(['BrainLab', 'BrainLabPages'], function () {
      var P = window.BrainLabPages;
      if (P.openSubject) P.openSubject(slug, true);
      else P.go('subjects');
    });
  };
  HBH.flashCard = function (topic) {
    navigate('brainlab/flashcards');
    HBH._wait(['BrainLab'], function () { window.BrainLab.startTopicFlashcards(topic); });
  };
  /* Daily Practice cards — real daily actions (no fake data dependency) */
  HBH.dailyChallenge = function () {
    navigate('brainlab');
    HBH._wait(['BrainLab'], function () { window.BrainLab.startDailyChallenge(); });
  };
  HBH.dailyQuiz = function () {
    navigate('brainlab');
    HBH._wait(['BrainLab'], function () { window.BrainLab.startCategoryQuiz('sq-gk'); });
  };
  HBH.dailyQuick10 = function () {
    navigate('brainlab');
    HBH._wait(['BrainLab'], function () { window.BrainLab.startArenaMode('quick10'); });
  };
  HBH.dailyAffairs = function () {
    navigate('brainlab');
    HBH._wait(['BrainLab', 'BrainLabV7'], function () {
      window.BrainLabV7.startAffairsQuiz();
    });
  };

  /* ═══════════ SECTION DEFINITIONS (spec §4 intended categories; the fill
     pass validates every item against real production data and swaps in the
     next real item when one is empty — fail-closed, never fabricate) ═══════ */

  var PREF = {
    exams: ['adr', 'police', 'apsc', 'tet'],
    tests: ['vfa', 'constable-abub', 'sub-inspector', 'apsc-cce'],
    mocks: ['sm-adre3', 'sm-adre4', 'sm-police', 'sm-apsc'],
    quizzes: ['sq-gk', 'sq-assam', 'sq-reason', 'sq-math'],
    pyq: ['ADRE', 'Assam Police', 'APSC', 'Assam TET'],
    mcq: ['Assam GK', 'General Knowledge', 'Reasoning', 'Mathematics'],
    subjects: ['General Knowledge', 'Mathematics', 'Reasoning', 'English']
  };

  var ICONS = {
    exams: ['🏛️', '🚔', '🎓', '🏫'],
    tests: ['🐄', '👮', '🚔', '🎓'],
    mocks: ['📋', '📄', '🚔', '📝'],
    quizzes: ['🧠', '🏔️', '🧩', '🔢'],
    pyq: ['📋', '🚔', '🎓', '🏫'],
    mcq: ['🏔️', '🧠', '🧩', '🔢'],
    subjects: ['🧠', '🔢', '🧩', '✍️']
  };

  var TITLES = {
    exams: ['ADRE — Assam Direct Recruitment', 'Assam Police', 'APSC', 'Assam TET'],
    tests: ['Assam VFA Exam', 'Constable (AB/UB)', 'Sub Inspector', 'APSC CCE Prelims'],
    mocks: ['ADRE Grade III', 'ADRE Grade IV', 'Assam Police', 'APSC Prelims'],
    quizzes: ['Daily GK Challenge', 'Assam GK Special', 'Reasoning & Logic', 'Mathematics'],
    pyq: ['ADRE PYQs', 'Assam Police PYQs', 'APSC PYQs', 'TET PYQs'],
    mcq: ['Assam GK', 'General Knowledge', 'Reasoning', 'Mathematics'],
    subjects: ['General Knowledge', 'Mathematics', 'Reasoning', 'English']
  };

  function cardHTML(id, icon, title, desc, onclick) {
    return '<button class="hbh-card" id="' + id + '" onclick="' + esc(onclick) + '">' +
      '<span class="hbh-card-ic">' + icon + '</span>' +
      '<span class="hbh-card-main">' +
        '<span class="hbh-card-title">' + esc(title) + '</span>' +
        '<span class="hbh-card-meta" id="' + id + '-meta">' + esc(desc) + '</span>' +
      '</span>' +
      '<span class="hbh-card-chev" aria-hidden="true">›</span>' +
    '</button>';
  }

  function sectionHTML(sid, icon, title, sub, viewAllLabel, viewAllCall, cards) {
    return '<section class="hbh-section" id="hbh-sec-' + sid + '">' +
      '<div class="hbh-head">' +
        '<div class="hbh-head-left">' +
          '<span class="hbh-title">' + icon + ' ' + esc(title) + '</span>' +
          '<span class="hbh-sub">' + esc(sub) + '</span>' +
        '</div>' +
        '<button class="hbh-viewall" onclick="' + esc(viewAllCall) + '">' + esc(viewAllLabel) + ' →</button>' +
      '</div>' +
      '<div class="hbh-list" id="hbh-list-' + sid + '">' + cards.join('') + '</div>' +
    '</section>';
  }

  function fourCards(sid, desc, onclickFor) {
    var out = [];
    for (var i = 0; i < 4; i++) {
      out.push(cardHTML('hbh-' + sid + '-' + i, ICONS[sid][i], TITLES[sid][i], desc(i), onclickFor(i)));
    }
    return out;
  }

  function build() {
    var h = '';

    /* Hub intro — the total stat is REAL, filled by _fill (never hardcoded) */
    h += '<div class="hbh-hub-banner" id="hbhHubBanner">' +
      '<div class="hbh-hub-title">🧪 BrainLab Practice Hub</div>' +
      '<div class="hbh-hub-sub">Official exam patterns · real questions · real counts — <span id="hbhHubStat">practice for Assam govt exams</span></div>' +
    '</div>';

    /* 1. EXAMS */
    h += sectionHTML('exams', '🎯', 'Exams', 'Pick your exam — mocks, PYQs, papers & subjects in one hub',
      'View All Exams', "HBH.view('exams')",
      fourCards('exams', function (i) { return 'Open the exam hub'; },
        function (i) { return "HBH.examCard('" + PREF.exams[i] + "')"; }));

    /* 2. TESTS */
    h += sectionHTML('tests', '📝', 'Tests', 'Blueprint-true full-length test series',
      'View All Tests', "HBH.view('tests')",
      fourCards('tests', function (i) { return 'Full-length practice tests'; },
        function (i) { return "HBH.testCard('" + PREF.tests[i] + "')"; }));

    /* 3. MOCK TESTS */
    h += sectionHTML('mocks', '⏱️', 'Mock Tests', 'Exam-simulated timed practice',
      'View All Mock Tests', "HBH.view('mock-tests')",
      fourCards('mocks', function (i) { return 'Timed mock test'; },
        function (i) { return "HBH.mockCard('" + MOCK_EXAMS[i] + "', '" + TITLES.mocks[i] + " Mock')"; }));

    /* 4. QUIZZES */
    h += sectionHTML('quizzes', '🧩', 'Quizzes', 'Quick category-wise practice quizzes',
      'View All Quizzes', "HBH.view('quizzes')",
      fourCards('quizzes', function (i) { return 'Category quiz'; },
        function (i) { return "HBH.quizCard('" + PREF.quizzes[i] + "')"; }));

    /* 5. PYQ PRACTICE */
    h += sectionHTML('pyq', '📚', 'PYQ Practice', 'Real previous-year questions, exam-wise',
      'View All PYQs', "HBH.view('pyq')",
      fourCards('pyq', function (i) { return 'Previous year questions'; },
        function (i) { return "HBH.pyqCard('" + PREF.pyq[i] + "')"; }));

    /* 6. MCQ PRACTICE */
    h += sectionHTML('mcq', '📋', 'MCQ Practice', 'Topic-wise MCQ practice from the verified bank',
      'View All MCQs', "HBH.view('mcqs')",
      fourCards('mcq', function (i) { return 'MCQ practice set'; },
        function (i) { return "HBH.mcqCard('" + PREF.mcq[i] + "')"; }));

    /* 7. SUBJECT PRACTICE */
    h += sectionHTML('subjects', '📚', 'Subject Practice', 'Focus one subject at a time, topic by topic',
      'View All Subjects', "HBH.view('subjects')",
      fourCards('subjects', function (i) { return 'Subject-wise practice'; },
        function (i) { return "HBH.subjCard('" + PREF.subjects[i].toLowerCase().replace(/[^a-z0-9]+/g, '-') + "', '" + PREF.subjects[i] + "')"; }));

    /* 8. DAILY PRACTICE — real actions; status lines filled from real data */
    var dl = [
      cardHTML('hbh-daily-0', '⚡', "Today's Challenge", '10 fresh mixed questions · builds your streak', "HBH.dailyChallenge()"),
      cardHTML('hbh-daily-1', '🧠', 'Daily GK Quiz', 'General knowledge practice set', "HBH.dailyQuiz()"),
      cardHTML('hbh-daily-2', '⚔️', 'Quick 10', 'Fast 10-question warm-up round', "HBH.dailyQuick10()"),
      cardHTML('hbh-daily-3', '📰', "Today's Affairs Quiz", "Built from today's published current affairs", "HBH.dailyAffairs()")
    ];
    h += sectionHTML('daily', '⚡', 'Daily Practice', 'A little every day — streaks that stick',
      'View All Daily', "HBH.viewDaily()", dl);

    /* 9. FLASHCARDS — deck titles/counts are derived by _fill (real decks) */
    var fl = [];
    for (var f = 0; f < 4; f++) {
      fl.push(cardHTML('hbh-flashcards-' + f, '🎴', 'Flashcard deck', 'Quick revision cards', "HBH.flashCard('')"));
    }
    h += sectionHTML('flashcards', '🎴', 'Flashcards', 'Flip-card revision on key topics',
      'View All Flashcards', "HBH.view('flashcards')", fl);

    return h;
  }

  /* mock exam names (SM entries carry the exam key used by the mock engine) */
  var MOCK_EXAMS = ['ADRE', 'ADRE', 'Assam Police', 'APSC'];

  /* ═══════════ REAL-COUNT FILL PASS (runs once the bundle is ready) ═══════════ */

  function dedupQB() {
    var seen = {}, out = [];
    (window.STUDYRIA_QB || []).forEach(function (q) {
      var k = String(String(q[0]).slice(0, 60) + q[5]);
      if (!seen[k]) { seen[k] = 1; out.push(q); }
    });
    return out;
  }

  function fillMeta(id, text) {
    var el = document.getElementById(id + '-meta');
    if (el) el.textContent = text;
  }

  /* preferred ids first (validated), then remaining real items — deduped */
  function firstReal(prefIds, all, keyOf, isValid) {
    var seen = {}, out = [];
    prefIds.forEach(function (id) {
      var o = all.filter(function (x) { return keyOf(x) === id; })[0];
      if (!o || seen[id]) return;
      if (isValid(o)) { seen[id] = 1; out.push(o); }
    });
    all.forEach(function (x) {
      var k = keyOf(x);
      if (seen[k]) return;
      if (isValid(x)) { seen[k] = 1; out.push(x); }
    });
    return out.slice(0, 4);
  }

  function realExams() {
    var U = window.BrainLabUniverse;
    if (!U || !U.ORGS) return [];
    return firstReal(PREF.exams, U.ORGS, function (o) { return o.id; }, function (o) {
      return o && U._orgStats && U._orgStats(o).n > 0;
    });
  }

  function realTests() {
    var BT = window.BrainLabTests;
    if (!BT) return [];
    var infos = (BT.SERIES || []).map(function (s) { return BT.info(s.id); }).filter(Boolean);
    return firstReal(PREF.tests, infos, function (i) { return i.s.id; }, function (i) {
      return i.published > 0;
    });
  }

  function realMocks() {
    var SM = window.SM || [], bl = window.BrainLab;
    return firstReal(PREF.mocks, SM, function (m) { return m.id; }, function (m) {
      return m && bl.filterQuestions({ exam: m.exam }).length > 0;
    });
  }

  function realQuizzes() {
    var SQ = window.SQ || [], bl = window.BrainLab;
    return firstReal(PREF.quizzes, SQ, function (q) { return q.id; }, function (q) {
      return q && bl.countByCategory(q.category) > 0;
    });
  }

  function realPYQs() {
    var bl = window.BrainLab;
    var names = PREF.pyq.concat(['SSC', 'Railway', 'Banking', 'General']);
    var seen = {}, out = [];
    names.forEach(function (ex) {
      if (seen[ex]) return;
      var pool = bl.filterQuestions({ exam: ex }).filter(function (q) { return q[17] === 'PYQ'; });
      if (pool.length > 0) { seen[ex] = 1; out.push({ ex: ex, cnt: pool.length }); }
    });
    return out.slice(0, 4);
  }

  function realCats(preferred) {
    var bl = window.BrainLab;
    var cats = bl.getCategories() || [];
    return firstReal(preferred, cats, function (c) { return c; }, function (c) {
      return typeof c === 'string' && bl.countByCategory(c) > 0;
    });
  }

  function realDecks() {
    var bl = window.BrainLab;
    var decks = (bl.getTopics('All') || []).map(function (t) {
      return { t: t, cnt: bl.countByTopic('All', t) };
    }).filter(function (d) { return d.cnt >= 5; });
    decks.sort(function (a, b) { return b.cnt - a.cnt; });
    return decks.slice(0, 4);
  }

  function setCard(el, title, icon, onclick, meta) {
    if (title != null) { var t = el.querySelector('.hbh-card-title'); if (t && t.textContent !== title) t.textContent = title; }
    if (icon != null) { var ic = el.querySelector('.hbh-card-ic'); if (ic && ic.textContent !== icon) ic.textContent = icon; }
    if (onclick != null) el.setAttribute('onclick', onclick);
    if (meta != null) fillMeta(el.id, meta);
  }

  HBH._fill = function () {
    var bl = window.BrainLab;
    if (!bl) return;

    /* hub banner stat — real dedup'd bank size */
    var qbN = dedupQB().length;
    var stat = document.getElementById('hbhHubStat');
    if (stat) stat.textContent = n2(qbN) + ' verified questions';

    var el, items, i;

    /* EXAMS */
    items = realExams();
    for (i = 0; i < 4; i++) {
      el = document.getElementById('hbh-exams-' + i);
      if (!el) continue;
      if (!items[i]) { el.remove(); continue; }
      var o = items[i], st = window.BrainLabUniverse._orgStats(o);
      setCard(el, o.name, o.ic, "HBH.examCard('" + o.id + "')",
        n2(st.n) + ' questions · ' + st.exN + ' exam' + (st.exN === 1 ? '' : 's') +
        (st.pyq ? ' · ' + st.pyq + ' PYQs' : ''));
    }

    /* TESTS */
    items = realTests();
    for (i = 0; i < 4; i++) {
      el = document.getElementById('hbh-tests-' + i);
      if (!el) continue;
      if (!items[i]) { el.remove(); continue; }
      var inf = items[i];
      setCard(el, inf.s.name, inf.s.icon, "HBH.testCard('" + inf.s.id + "')",
        inf.published + (inf.published === 1 ? ' Test' : ' Tests') + ' · ' + n2(inf.mcqs) +
        ' MCQs' + (inf.pending > 0 ? ' · more coming' : '') + ' · ' + inf.s.org);
    }

    /* MOCK TESTS */
    items = realMocks();
    for (i = 0; i < 4; i++) {
      el = document.getElementById('hbh-mocks-' + i);
      if (!el) continue;
      if (!items[i]) { el.remove(); continue; }
      var mk = items[i];
      setCard(el, mk.title, mk.icon,
        "HBH.mockCard('" + mk.exam + "', '" + String(mk.title).replace(/'/g, "\\'") + " Mock')",
        n2(bl.filterQuestions({ exam: mk.exam }).length) + ' questions · timed exam simulation');
    }

    /* QUIZZES */
    items = realQuizzes();
    for (i = 0; i < 4; i++) {
      el = document.getElementById('hbh-quizzes-' + i);
      if (!el) continue;
      if (!items[i]) { el.remove(); continue; }
      var qz = items[i];
      setCard(el, qz.title, qz.icon, "HBH.quizCard('" + qz.id + "')",
        n2(bl.countByCategory(qz.category)) + ' questions · ' + qz.category);
    }

    /* PYQ PRACTICE */
    items = realPYQs();
    for (i = 0; i < 4; i++) {
      el = document.getElementById('hbh-pyq-' + i);
      if (!el) continue;
      if (!items[i]) { el.remove(); continue; }
      setCard(el, items[i].ex + ' PYQs', null, "HBH.pyqCard('" + items[i].ex + "')",
        n2(items[i].cnt) + ' previous-year questions');
    }

    /* MCQ PRACTICE */
    items = realCats(PREF.mcq);
    for (i = 0; i < 4; i++) {
      el = document.getElementById('hbh-mcq-' + i);
      if (!el) continue;
      if (!items[i]) { el.remove(); continue; }
      setCard(el, items[i], null, "HBH.mcqCard('" + items[i] + "')",
        n2(bl.countByCategory(items[i])) + ' MCQs available');
    }

    /* SUBJECT PRACTICE */
    items = realCats(PREF.subjects);
    for (i = 0; i < 4; i++) {
      el = document.getElementById('hbh-subjects-' + i);
      if (!el) continue;
      if (!items[i]) { el.remove(); continue; }
      var sc = items[i];
      var topics = (bl.getTopics(sc) || []).length;
      setCard(el, sc, null,
        "HBH.subjCard('" + sc.toLowerCase().replace(/[^a-z0-9]+/g, '-') + "', '" + sc + "')",
        topics + ' topic' + (topics === 1 ? '' : 's') + ' · ' + n2(bl.countByCategory(sc)) + ' questions');
    }

    /* DAILY PRACTICE — real device activity only */
    try {
      var streak = bl.dayStreak ? bl.dayStreak() : 0;
      var done = bl.getDailyStatus ? bl.getDailyStatus() : null;
      fillMeta('hbh-daily-0', done
        ? 'Done today — ' + done.correct + '/' + done.total + ' correct · ' + streak + '-day streak'
        : '10 fresh mixed questions · ' + streak + '-day streak');
      var gkN = bl.countByCategory('General Knowledge');
      if (gkN > 0) fillMeta('hbh-daily-1', n2(gkN) + ' general knowledge questions');
    } catch (e) { /* daily cards keep their honest default lines */ }

    /* FLASHCARDS — real decks (topics with ≥5 questions), largest first */
    items = realDecks();
    for (i = 0; i < 4; i++) {
      el = document.getElementById('hbh-flashcards-' + i);
      if (!el) continue;
      if (!items[i]) { el.remove(); continue; }
      setCard(el, items[i].t, null,
        "HBH.flashCard('" + String(items[i].t).replace(/'/g, "\\'") + "')",
        n2(items[i].cnt) + ' flashcards');
    }

    /* hide any section whose cards were all removed (fail-closed) */
    ['exams', 'tests', 'mocks', 'quizzes', 'pyq', 'mcq', 'subjects', 'flashcards'].forEach(function (s) {
      var sec = document.getElementById('hbh-sec-' + s);
      if (sec && !sec.querySelectorAll('.hbh-card').length) sec.style.display = 'none';
    });
  };

  /* exposed for the test suite (no runtime use) */
  HBH._debugBuild = build;

  /* ═══════════ BOOT ═══════════ */

  function boot() {
    var tries = 0;
    (function t() {
      var host = document.getElementById('sv2BrainLabHub');
      if (host && !host.firstChild) {
        host.innerHTML = build();

        /* preload the BrainLab bundle in the background (same lazy loader
           as the #brainlab route — nothing blocks the homepage render),
           then fill every card with REAL production counts */
        var fill = function () {
          HBH._wait(['BrainLab', 'BrainLabPages'], function () { HBH._fill(); });
        };
        if (window.__routePreload) {
          window.__routePreload('brainlab').then(fill).catch(function (e) {
            console.warn('[hbh] brainlab preload failed', e);
          });
        } else {
          fill();
        }
        return;
      }
      if (++tries <= 100) setTimeout(t, 200); /* wait for sv2 injectSections */
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 150); });
  } else {
    setTimeout(boot, 150);
  }
})();
