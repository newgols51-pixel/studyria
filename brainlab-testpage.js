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
    active: false, exam: null, n: 0, key: '', submitting: false, _fixedOrder: false
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
        v: 1, exam: TP.exam, n: TP.n,
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
    TP._fixedOrder = true;
    try {
      bl.startQuizSession({
        mode: 'mock',
        title: e.name + ' — Mock Test ' + n,
        questions: m.qs.length,
        exam: (u.examKey ? u.examKey(ex) : ex),
        pool: m.qs
      });
    } finally { TP._fixedOrder = false; }

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
    if (M && M.active && !TP.submitting) {
      if (!confirm('Leave this test?\n\nYour attempt is saved — you can resume Mock Test ' + TP.n + ' anytime from the exam hub.')) return;
    }
    var ex = TP.exam;
    TP.unmount(); TP.active = false;
    location.hash = '#brainlab/exams/' + ex;
  };
  TP._before = function (e) {
    var M = window.BrainLabMock;
    if (TP.active && M && M.active && !TP.submitting) { e.preventDefault(); e.returnValue = ''; }
  };
  TP._onHash = function () {
    var M = window.BrainLabMock;
    if (!TP.active || TP.submitting) return;
    var expect = '#brainlab/exams/mock/' + TP.exam + '/' + TP.n;
    if ((location.hash || '') === expect) return;
    if (M && M.active) {
      if (!confirm('Leave this test?\n\nYour attempt is saved — resume Mock Test ' + TP.n + ' anytime from the exam hub.')) {
        location.hash = expect; return;
      }
    }
    TP.unmount(); TP.active = false; /* attempt stays saved for resume */
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
        TP.unmount(); TP.active = false;
        /* the ORIGINAL _finishQuiz renders the result page into the hub
           player area — make it visible again (hidden while the
           dedicated test page was open) */
        var hub = document.getElementById('bl-quiz-player-area');
        if (hub) hub.style.display = 'block';
        var r = oSubmit.apply(this, arguments);
        TP.submitting = false;
        return r;
      }
      return oSubmit.apply(this, arguments);
    };
  }
  boot();
})();
