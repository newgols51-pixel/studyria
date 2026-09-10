/* ════════════════════════════════════════════════════════════════
   brainlab-testpage.js — STUDYRIA DEDICATED TEST PAGE (additive)
   Route: #brainlab/exams/mock/<examId>/<n>

   The Exam Preparation Hub stays a discovery page — the actual
   test-taking experience gets its own full-screen dedicated page:

   - full-screen overlay page (own header, language toggle, timer)
   - mock engine renders INTO this page (brainlab-mock.js targets
     #bl-tp-area when present — same engine, no second engine)
   - attempt state (answers, marks, question index, timer endAt,
     language, start time) persisted to localStorage → refresh /
     back-button / accidental exit all RESUME the same attempt
   - timer is attempt-scoped: endAt persisted, countdown continues
     correctly across reloads; expired-while-away = honest auto-submit
   - submit/auto-submit routes through the ORIGINAL mock submit →
     BrainLab._finishQuiz (scoring, session recording, streak,
     mistakes, review — all existing logic preserved)
   - language switch mid-test: preserves answers, index, timer and
     marks; only displayed content changes (question data driven)
   - leaving route with an active attempt asks for confirmation and
     KEEPS the saved attempt for later resume

   ZERO changes to: backend, DB, RPC, auth, payment, checkout,
   session recording, result calculation, learn player, other modes.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function B() { return window.BrainLab; }
  function U() { return window.BrainLabUniverse; }

  var TP = window.BrainLabTestPage = {
    active: false, exam: null, n: 0, key: '', submitting: false, _fixedOrder: false,
    _fromTP: false, resultMode: false, expectHash: '', exitHash: '', _lastCfg: null
  };

  function esc(s) { var bl = B(); return bl ? bl.escape(s) : String(s == null ? '' : s); }

  /* ── attempt persistence (per exam + mock number — one active attempt) ── */
  TP.stateKey = function (ex, n) { return 'bl_tp_' + ex + '_' + n; };
  TP.saved = function (ex, n) {
    try { var j = JSON.parse(localStorage.getItem(TP.stateKey(ex, n)) || 'null'); return (j && j.v === 1) ? j : null; }
    catch (e) { return null; }
  };
  TP.save = function () {
    var bl = B(), M = window.BrainLabMock;
    if (!bl || !M || !M.active || !TP.active || TP.submitting) return;
    try {
      localStorage.setItem(TP.key, JSON.stringify({
        v: 1, exam: TP.exam, n: TP.n, cfg: TP._lastCfg || null,
        answers: bl._answers || [],
        marked: M.marked || {},
        qIdx: bl._currentQIdx || 0,
        endAt: M.endAt, startedAt: bl._startTime,
        lang: bl._lang || 'en'
      }));
    } catch (e) {}
  };
  /* called by the mock engine after every state change (render hook) */
  TP.onRender = function () {
    if (!TP.active) return;
    TP.save();
    var en = document.getElementById('bl-tp-en'), as = document.getElementById('bl-tp-as');
    var bl = B();
    if (en) en.className = 'bl-tp-lbtn' + (bl && bl._lang === 'as' ? '' : ' on');
    if (as) as.className = 'bl-tp-lbtn' + (bl && bl._lang === 'as' ? ' on' : '');
  };

  /* ── page overlay ── */
  TP.mount = function (e, m) {
    TP.unmount();
    TP.expectHash = TP.exam ? ('#brainlab/exams/mock/' + TP.exam + '/' + TP.n) : (location.hash || '#brainlab/mock-tests');
    TP.exitHash = TP.exam ? ('#brainlab/exams/' + TP.exam) : (TP.exitHash || '#brainlab/mock-tests');
    var bl = B(); if (!bl) return;
    var pg = document.createElement('div');
    pg.id = 'bl-tp-page';
    pg.innerHTML = '<div class="bl-tp-head">'
      + '<button class="bl-tp-back" id="bl-tp-back" aria-label="Exit test">←</button>'
      + '<div class="bl-tp-twrap">'
      + '<div class="bl-tp-title">' + esc((bl._currentQuiz && bl._currentQuiz.title) || 'Mock Test') + '</div>'
      + '<div class="bl-tp-sub">' + esc(e.name) + ' · ' + m.qs.length + ' MCQs · ' + m.qs.length + ' min</div>'
      + '</div>'
      + '<div class="bl-tp-lang">'
      + '<button id="bl-tp-en" class="bl-tp-lbtn' + (bl._lang === 'as' ? '' : ' on') + '" onclick="BrainLabTestPage.setLang(\'en\')">EN</button>'
      + '<button id="bl-tp-as" class="bl-tp-lbtn' + (bl._lang === 'as' ? ' on' : '') + '" onclick="BrainLabTestPage.setLang(\'as\')">অ</button>'
      + '</div></div>'
      + '<div class="bl-tp-body" id="bl-tp-area"></div>';
    document.body.appendChild(pg);
    document.body.classList.add('bl-tp-open');
    /* the session's first render (inside startQuizSession) landed in the
       hub player area before this page mounted — clear that stale markup
       so duplicate IDs (timer, palette) can never shadow the live page */
    var stale = document.getElementById('bl-quiz-player-area');
    if (stale) { stale.innerHTML = ''; stale.style.display = 'none'; }
    var back = document.getElementById('bl-tp-back');
    if (back) back.onclick = TP.exit;
    window.addEventListener('hashchange', TP._onHash);
    window.addEventListener('beforeunload', TP._before);
  };
  TP.unmount = function () {
    var pg = document.getElementById('bl-tp-page');
    if (pg) pg.remove();
    document.body.classList.remove('bl-tp-open');
    window.removeEventListener('hashchange', TP._onHash);
    window.removeEventListener('beforeunload', TP._before);
  };

  /* ── open / resume ── */
  TP.open = function (ex, n, push) {
    if (push !== false) { location.hash = '#brainlab/exams/mock/' + ex + '/' + n; return; }
    var u = U();
    if (!u || !u.findExam || !u.mockSeries) { setTimeout(function () { TP.open(ex, n, false); }, 250); return; }
    var bl = B(); if (!bl) { setTimeout(function () { TP.open(ex, n, false); }, 300); return; }
    /* already showing this exact test → just refresh the view */
    if (TP.active && TP.exam === ex && TP.n === n) { if (window.BrainLabMock) window.BrainLabMock.render(); return; }
    var e = u.findExam(ex);
    var series = e ? u.mockSeries(e) : [];
    var m = null;
    for (var i = 0; i < series.length; i++) { if (series[i].n === n) { m = series[i]; break; } }
    if (!e || !m) { location.hash = '#brainlab/exams/' + ex; return; }

    TP.exam = ex; TP.n = n; TP.key = TP.stateKey(ex, n); TP.submitting = false;

    /* start the attempt with the mock's OWN deterministic question set,
       in fixed order (stable across refresh → attempt state aligns) */
    TP._fixedOrder = true; TP._fromTP = true;
    try {
      bl.startQuizSession({
        mode: 'mock',
        title: e.name + ' — Mock Test ' + n,
        questions: m.qs.length,
        exam: (u.examKey ? u.examKey(ex) : ex),
        pool: m.qs
      });
    } finally { TP._fixedOrder = false; TP._fromTP = false; }

    var M = window.BrainLabMock;
    if (!M || !M.active) { TP.active = false; return; }

    TP.mount(e, m);
    TP.active = true;

    /* resume a saved attempt for THIS mock (refresh/back-button path) */
    var sv = TP.saved(ex, n);
    if (sv) {
      bl._answers = sv.answers || [];
      bl._currentQIdx = Math.min(sv.qIdx || 0, m.qs.length - 1);
      if (sv.startedAt) bl._startTime = sv.startedAt;
      if (sv.lang) bl._lang = sv.lang;
      M.marked = sv.marked || {};
      if (sv.endAt && sv.endAt > Date.now()) {
        M.endAt = sv.endAt; /* countdown continues — no fresh timer */
      } else if (sv.endAt) {
        /* timer expired while away — honest auto-submit */
        setTimeout(function () {
          if (M.active && !M.submitted && TP.active) {
            alert('Time is up! Your test is being submitted automatically.');
            M.submit();
          }
        }, 800);
      }
    }
    M.render();
    /* background warm-up of Assamese translations for the whole test
       (server cache; chunks; cancellable) — never blocks the test */
    if (window.BLTR && B() && B()._lang === 'as' && B()._currentQuiz) window.BLTR.prefetch(B()._currentQuiz.questions);
  };

  /* ── language switch mid-test: only displayed content changes ── */
  TP.setLang = function (l) {
    var bl = B(); if (!bl) return;
    bl._lang = l;
    var M = window.BrainLabMock;
    if (M && M.active) M.render();
    TP.onRender();
    /* translation fallback: warm the cache in AS, cancel background work in EN */
    if (window.BLTR) {
      if (l === 'as') { if (bl._currentQuiz) window.BLTR.prefetch(bl._currentQuiz.questions); }
      else window.BLTR.stop();
    }
  };

  /* ── exit / abandon safety ── */
  TP.exit = function () {
    var M = window.BrainLabMock;
    if (TP.resultMode) { TP.exitResult(); return; }
    if (M && M.active && !TP.submitting) {
      if (!confirm('Leave this test?\n\nYour attempt is saved — you can resume it anytime.')) return;
    }
    var ex = TP.exam;
    TP.unmount(); TP.active = false;
    location.hash = ex ? ('#brainlab/exams/' + ex) : (TP.exitHash || '#brainlab/mock-tests');
  };
  TP._before = function (e) {
    var M = window.BrainLabMock;
    if (TP.active && M && M.active && !TP.submitting) { e.preventDefault(); e.returnValue = ''; }
  };
  TP._onHash = function () {
    var M = window.BrainLabMock;
    if (TP.resultMode) { TP.resultMode = false; TP.unmount(); TP.active = false; return; }
    if (!TP.active || TP.submitting) return;
    var expect = TP.expectHash || ('#brainlab/exams/mock/' + TP.exam + '/' + TP.n);
    if ((location.hash || '') === expect) return;
    if (M && M.active) {
      if (!confirm('Leave this test?\n\nYour attempt is saved — you can resume it anytime.')) {
        if (TP.expectHash) { location.hash = expect; return; }
        history.pushState(null, '', expect); return;
      }
    }
    TP.unmount(); TP.active = false; /* attempt stays saved for resume */
  };

  /* ── dedicated page for ANY mock (spec §1/§2/§3): BrainLab mock-list cards,
     count-picker mocks and retried sessions all open THIS full-screen page.
     Universe exam mocks keep their #brainlab/exams/mock/<exam>/<n> route. ── */
  TP.savedCustom = function (key) {
    try { var j = JSON.parse(localStorage.getItem(key) || 'null'); return (j && j.v === 1) ? j : null; }
    catch (e) { return null; }
  };
  TP.startDedicated = function (opts) {
    var bl = B(); var M = window.BrainLabMock;
    if (!bl || !M || M.active || TP.active) return;
    var pool = opts.pool;
    var count = Math.min(opts.questions || 10, pool ? pool.length : (opts.questions || 10));
    var title = opts.title || 'Mock Test';
    TP.exam = null; TP.n = 0;
    TP.key = 'bl_tp_custom_' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
    TP.exitHash = '#brainlab/mock-tests';
    TP._lastCfg = { title: title, exam: opts.exam || 'All', category: opts.category || 'All',
      topic: opts.topic || 'All', difficulty: opts.difficulty || 'mixed', questions: count };
    TP._fixedOrder = true; TP._fromTP = true; /* deterministic set → refresh/resume aligned */
    try {
      bl.startQuizSession({ mode: 'mock', title: title, questions: count,
        category: opts.category || 'All', topic: opts.topic || 'All',
        exam: opts.exam || 'All', difficulty: opts.difficulty || 'mixed',
        pool: pool });
    } finally { TP._fixedOrder = false; TP._fromTP = false; }
    if (!M || !M.active) return;
    TP.mount({ name: title }, { qs: { length: count } });
    TP.active = true;
    /* resume a saved attempt for THIS mock (refresh path) */
    var sv = TP.savedCustom(TP.key);
    if (sv) {
      bl._answers = sv.answers || [];
      bl._currentQIdx = Math.min(sv.qIdx || 0, count - 1);
      if (sv.startedAt) bl._startTime = sv.startedAt;
      if (sv.lang) bl._lang = sv.lang;
      M.marked = sv.marked || {};
      if (sv.endAt && sv.endAt > Date.now()) { M.endAt = sv.endAt; }
      else if (sv.endAt) {
        setTimeout(function () {
          if (M.active && !M.submitted && TP.active) {
            alert('Time is up! Your test is being submitted automatically.');
            M.submit();
          }
        }, 800);
      }
    }
    M.render();
    if (window.BLTR && B() && B()._lang === 'as' && B()._currentQuiz) window.BLTR.prefetch(B()._currentQuiz.questions);
  };
  TP.retry = function () {
    var ex = TP.exam, n = TP.n, cfg = TP._lastCfg;
    TP.resultMode = false; TP.unmount(); TP.active = false;
    if (ex && window.BrainLabUniverse) { TP.open(ex, n, false); return; } /* same fixed question set */
    if (cfg) TP.startDedicated({ mode: 'mock', title: cfg.title, questions: cfg.questions,
      category: cfg.category, topic: cfg.topic, exam: cfg.exam, difficulty: cfg.difficulty });
  };
  TP.exitResult = function () {
    TP.resultMode = false; TP.unmount(); TP.active = false;
    location.hash = TP.exam ? ('#brainlab/exams/' + TP.exam) : (TP.exitHash || '#brainlab/mock-tests');
  };
  /* auto-resume a custom-mock attempt after a FULL page reload (mock-tests page) */
  TP._bootResume = function () {
    if (!/^#brainlab\/mock-tests/.test(location.hash || '')) return;
    var bl = B(); if (!bl || bl._currentQuiz) return;
    var M = window.BrainLabMock; if (!M || M.active || TP.active) return;
    try {
      var keys = Object.keys(localStorage).filter(function (k) { return k.indexOf('bl_tp_custom_') === 0; });
      for (var i = 0; i < keys.length; i++) {
        var j = TP.savedCustom(keys[i]);
        if (!j || !j.cfg) { if (j === null) localStorage.removeItem(keys[i]); continue; }
        if (!j.endAt || j.endAt <= Date.now()) { localStorage.removeItem(keys[i]); continue; }
        var cfg = j.cfg;
        var pool = bl.filterQuestions({ category: cfg.category || 'All', topic: cfg.topic || 'All', exam: cfg.exam || 'All', difficulty: 'mixed' });
        if (cfg.difficulty && cfg.difficulty !== 'mixed') pool = pool.filter(function (q) { return q[9] === cfg.difficulty; });
        if (!pool.length) continue;
        TP.startDedicated({ mode: 'mock', title: cfg.title, questions: Math.min(cfg.questions || 10, pool.length),
          category: cfg.category, topic: cfg.topic, exam: cfg.exam, difficulty: cfg.difficulty, pool: pool });
        return;
      }
    } catch (e) { }
  };

  /* ── boot: engine-safe wraps (no engine internals modified) ── */
  function boot() {
    var bl = B(), M = window.BrainLabMock;
    if (!bl || !M) { setTimeout(boot, 300); return; }
    if (bl.__tpWrapped) return;
    bl.__tpWrapped = true;
    /* fixed question order ONLY for dedicated-page attempts */
    var oSel = bl.selectQuestions;
    bl.selectQuestions = function (pool, count) {
      if (TP._fixedOrder) return pool.slice(0, count);
      return oSel.apply(this, arguments);
    };
    /* submit/auto-submit → clear saved attempt, close page, then
       the ORIGINAL submit → _finishQuiz (existing result + recording) */
    var oSubmit = M.submit;
    M.submit = function () {
      if (TP.active) {
        TP.submitting = true;
        try { localStorage.removeItem(TP.key); } catch (e2) {}
        /* the ORIGINAL _finishQuiz now renders the result INTO the dedicated
           page (#bl-tp-area wins in its container lookup) — the page stays
           mounted so the result + review appear on the test page itself,
           with no other BrainLab content around it (spec §2/§10) */
        var r = oSubmit.apply(this, arguments);
        TP.submitting = false;
        TP.resultMode = true;
        var area = document.getElementById('bl-tp-area');
        if (area) {
          var rb = area.querySelector('.bl-result-retry');
          if (rb) rb.onclick = function () { TP.retry(); };
          var xb = area.querySelector('.bl-result-exit');
          if (xb) xb.onclick = function () { TP.exitResult(); };
        }
        return r;
      }
      return oSubmit.apply(this, arguments);
    };
    /* EVERY mock session (list cards, count-picker, retry of an old session)
       opens the DEDICATED page — no mock plays inside a mixed page (spec §2) */
    var oSess = bl.startQuizSession;
    bl.startQuizSession = function (opts) {
      if (opts && opts.mode === 'mock' && !TP._fromTP && !TP.active) {
        return TP.startDedicated(opts);
      }
      return oSess.apply(this, arguments);
    };
    /* abort/quit from the dedicated page: the engine already confirmed —
       clean up WITHOUT a second confirm dialog, drop the saved attempt */
    var oQuit = bl.quitQuiz;
    bl.quitQuiz = function () {
      if (TP.active && !TP.resultMode) {
        if (bl._timerInterval) clearInterval(bl._timerInterval);
        bl._currentQuiz = null; bl._answers = []; bl._currentQIdx = 0;
        try { localStorage.removeItem(TP.key); } catch (e2) { }
        TP.unmount(); TP.active = false;
        location.hash = TP.exam ? ('#brainlab/exams/' + TP.exam) : (TP.exitHash || '#brainlab/mock-tests');
        return;
      }
      return oQuit.apply(this, arguments);
    };
    /* full-reload resume for list mocks (universe mocks resume via their hash route) */
    setTimeout(function () { try { TP._bootResume(); } catch (e) { } }, 1500);
  }
  boot();
})();
