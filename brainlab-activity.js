/* ════════════════════════════════════════════════════════════════
   brainlab-activity.js — STUDYRIA DEDICATED ACTIVITY PAGES (additive)
   v20260910a

   Every question-based BrainLab module gets its OWN professional
   dedicated attempt/practice page — the SAME shared question engine
   (renderer, answer state, scoring, translation, persistence,
   session recording), a SEPARATE full-screen user-facing page:

     Quiz          → dedicated Quiz Attempt Page        (immediate feedback)
     MCQ Practice  → dedicated MCQ Practice Page         (immediate feedback)
     PYQ Practice  → dedicated PYQ Practice Page        (immediate feedback)
     Subject       → dedicated Subject Practice Page    (immediate feedback)
     Daily         → dedicated Daily Practice Page      (immediate feedback)
     Current Aff.  → dedicated Current Affairs Page     (immediate feedback)
     Arena/custom  → dedicated Practice Page            (immediate feedback)
     Mistakes      → dedicated Mistake Practice Page    (immediate feedback)
     Flashcards    → dedicated Flashcard Practice Page  (reveal/recall UX)

   Activity MODE drives the page (spec §13) — never the page title:
   mode → { page label, back destination } from MODES registry below.

   Mock Tests are NOT handled here — they already have their own
   dedicated page (brainlab-testpage.js, exam simulation). The ONLY
   exception: a mock-mode session started directly by the Current
   Affairs module (30+ questions) — it gets this page as a shell and
   the REAL mock engine renders inside it (same simulation UX).

   REUSED AS-IS (zero duplication — spec §12):
   - QuestionRenderer/OptionRenderer/Feedback: BrainLab._renderQuestion
   - AnswerState: BrainLab._answers + selectAnswer (locked, no re-answer)
   - Scoring/Result/Review: BrainLab._finishQuiz (v7 premium result)
   - TranslationResolver: BrainLabTranslate + BLTR server fallback
   - Timer: engine elapsed timer (honest — only when a timer exists)
   - AttemptPersistence: engine session recording (saveSession)
   - Flashcard engine: startFlashcards/renderFlashcard (upgraded UX)

   ZERO changes to: mock test page, backend, DB, auth, payment,
   checkout, session recording, mistake book, streaks, admin.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function B() { return window.BrainLab; }
  function TP() { return window.BrainLabTestPage || {}; }
  function M() { return window.BrainLabMock || {}; }

  var A = window.BrainLabActivity = {
    active: false, kind: null, resultMode: false,
    exitHash: '#brainlab', _hashAtMount: '#brainlab', _lastQuestions: null,
    _fcTopic: null
  };

  function esc(s) { var bl = B(); return bl ? bl.escape(s) : String(s == null ? '' : s); }

  /* ── §13 activity-mode registry: MODE controls page behavior/destination ── */
  A.MODES = {
    quiz:      { label: 'Quiz',              exit: '#brainlab/quizzes' },
    mcq:       { label: 'MCQ Practice',      exit: '#brainlab/mcqs' },
    pyq:       { label: 'PYQ Practice',      exit: '#brainlab/pyq' },
    daily:     { label: "Today's Practice",  exit: '#brainlab' },
    affairs:   { label: 'Current Affairs',   exit: '#brainlab/current-affairs' },
    arena:     { label: 'Practice',          exit: '#brainlab/arena' },
    practice:  { label: 'Practice',          exit: '#brainlab/arena' },
    custom:    { label: 'Custom Practice',   exit: '#brainlab/arena' },
    weak:      { label: 'Weak Area Practice', exit: '#brainlab' },
    mistakes:  { label: 'Mistake Practice', exit: '#brainlab/mistakes' },
    flashcards:{ label: 'Flashcards',        exit: '#brainlab/flashcards' },
    mock:      { label: 'Mock Test',         exit: '#brainlab/current-affairs' } /* CA 30+ direct-mock only */
  };

  A.alive = function () { return A.active || TP().active || M().active; };

  /* ── page overlay (same Studyria identity as the mock test page) ── */
  A.mount = function (title, sub) {
    A.unmount();
    var bl = B(); if (!bl) return;
    A._hashAtMount = location.hash || '#brainlab';
    var pg = document.createElement('div');
    pg.id = 'bl-act-page';
    pg.innerHTML = '<div class="bl-tp-head">'
      + '<button class="bl-tp-back" id="bl-act-back" aria-label="Back">←</button>'
      + '<div class="bl-tp-twrap">'
      + '<div class="bl-tp-title" id="bl-act-title">' + esc(title) + '</div>'
      + '<div class="bl-tp-sub" id="bl-act-sub">' + esc(sub) + '</div>'
      + '</div>'
      + '<div class="bl-tp-lang">'
      + '<button id="bl-act-en" class="bl-tp-lbtn' + (bl._lang === 'as' ? '' : ' on') + '" onclick="BrainLabActivity.setLang(\'en\')">EN</button>'
      + '<button id="bl-act-as" class="bl-tp-lbtn' + (bl._lang === 'as' ? ' on' : '') + '" onclick="BrainLabActivity.setLang(\'as\')">অ</button>'
      + '</div></div>'
      + '<div class="bl-tp-body" id="bl-tp-area"></div>';
    document.body.appendChild(pg);
    document.body.classList.add('bl-tp-open');
    /* clear any stale hub-player markup so duplicate IDs can never shadow the page */
    var stale = document.getElementById('bl-quiz-player-area');
    if (stale) { stale.innerHTML = ''; stale.style.display = 'none'; }
    var back = document.getElementById('bl-act-back');
    if (back) back.onclick = A.exit;
    A.active = true;
    A.resultMode = false;
    window.addEventListener('hashchange', A._onHash);
  };
  A.unmount = function () {
    var pg = document.getElementById('bl-act-page');
    if (pg) pg.remove();
    document.body.classList.remove('bl-tp-open');
    window.removeEventListener('hashchange', A._onHash);
  };
  A.close = function () { A.active = false; A.resultMode = false; A.unmount(); };

  A.syncLang = function () {
    var bl = B();
    var en = document.getElementById('bl-act-en'), as = document.getElementById('bl-act-as');
    if (en) en.className = 'bl-tp-lbtn' + (bl && bl._lang === 'as' ? '' : ' on');
    if (as) as.className = 'bl-tp-lbtn' + (bl && bl._lang === 'as' ? ' on' : '');
  };

  /* ── session → dedicated page (practice modes; flashcards handled separately) ── */
  A.onSession = function (opts) {
    var bl = B(); if (!bl || !opts) return;
    var mode = opts.mode || 'quiz';
    var cfg = A.MODES[mode] || { label: 'Practice', exit: '#brainlab' };
    A.kind = mode;
    A.exitHash = cfg.exit;
    A._lastQuestions = opts.questions || [];
    var n = (opts.questions || []).length;
    var sub = n + (mode === 'mock' ? ' MCQs' : ' Questions') + ' · ' + cfg.label;
    if (!A.active) {
      A.mount(opts.title || cfg.label, sub);
      A.syncLang();
      /* the session's first render went into the (now hidden) hub player —
         re-render into the dedicated page */
      if (mode === 'mock') { if (M().render) M().render(); }
      else bl._renderQuestion();
    } else {
      /* retry / restart while the page is already open: refresh header + body */
      var t = document.getElementById('bl-act-title'), s2 = document.getElementById('bl-act-sub');
      if (t) t.innerHTML = esc(opts.title || cfg.label);
      if (s2) s2.innerHTML = esc(sub);
      A.syncLang();
      if (mode === 'mock') { if (M().render) M().render(); }
      else bl._renderQuestion();
    }
    /* warm Assamese translations in background when in Assamese (never blocks) */
    if (window.BLTR && bl._lang === 'as' && mode !== 'mock' && bl._currentQuiz) {
      window.BLTR.prefetch(bl._currentQuiz.questions);
    }
  };

  /* ── flashcards → dedicated flashcard page (own UX, not the MCQ layout) ── */
  A.onFlashcards = function (topic, cards) {
    var bl = B(); if (!bl) return;
    A.kind = 'flashcards';
    A.exitHash = (A.MODES.flashcards || {}).exit;
    A._lastQuestions = null;
    var n = (cards || []).length;
    var title = (topic ? topic + ' — ' : '') + 'Flashcards';
    if (!A.active) {
      A.mount(title, n + ' Cards · Tap a card to reveal the answer');
      A.syncLang();
    } else {
      var t = document.getElementById('bl-act-title'), s2 = document.getElementById('bl-act-sub');
      if (t) t.innerHTML = esc(title);
      if (s2) s2.innerHTML = esc(n + ' Cards · Tap a card to reveal the answer');
    }
    bl.renderFlashcard(); /* renders into #bl-tp-area (container preference) */
  };

  /* ── language: EN/অ switch — only displayed content changes (controls stay EN, §15) ── */
  A.setLang = function (l) {
    var bl = B(); if (!bl) return;
    bl._lang = l;
    if (A.kind === 'flashcards') bl.renderFlashcard();
    else if (bl._currentQuiz) bl._renderQuestion();
    A.syncLang();
    if (window.BLTR) {
      if (l === 'as' && bl._currentQuiz) window.BLTR.prefetch(bl._currentQuiz.questions);
      else window.BLTR.stop();
    }
  };

  /* ── back / exit (§22): back to the module's own list — engine confirms first ── */
  A.exit = function () {
    var bl = B();
    if (A.resultMode) { A.exitResult(); return; }
    if (A.kind === 'flashcards') {
      if (bl && bl.exitFlashcards) { try { bl.exitFlashcards(); } catch (e) { } }
      A.close(); location.hash = A.exitHash;
      return;
    }
    if (bl && bl._currentQuiz) {
      try { bl.quitQuiz(); } catch (e) { } /* honest confirm — never lose an attempt silently */
    }
    if (!bl || !bl._currentQuiz) { A.close(); location.hash = A.exitHash; }
  };
  A.exitResult = function () {
    var bl = B();
    A.resultMode = false;
    A.close();
    if (bl && bl._currentQuiz) { /* defensive cleanup — engine already reset state on finish */
      try { bl._currentQuiz = null; bl._answers = []; bl._currentQIdx = 0; } catch (e) { }
    }
    if (bl && bl.exitQuiz) { try { bl.exitQuiz(); } catch (e) { } } /* refresh hub stats */
    location.hash = A.exitHash;
  };
  /* retry the SAME question set (learning mode — session recording intact) */
  A.retry = function () {
    var bl = B(); if (!bl) return;
    var qs = A._lastQuestions;
    A.resultMode = false;
    if (!qs || !qs.length) { A.exitResult(); return; }
    var meta = bl._sessionMeta || {};
    bl._sessionId = 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    if (meta) meta.started_at = new Date().toISOString();
    bl._startPlayer({ title: meta.title || 'Practice', questions: qs, mode: A.kind || 'quiz' });
  };

  /* ── Android-back / stray hash change: confirm, never lose the attempt silently ── */
  A._onHash = function () {
    if (!A.active) return;
    if ((location.hash || '') === A._hashAtMount) return;
    var bl = B();
    if (A.resultMode || !bl || (!bl._currentQuiz && !bl._flashcards)) { A.close(); return; }
    if (!confirm('Leave this practice?\n\nYour progress on this set will be lost.')) {
      history.pushState(null, '', A._hashAtMount);
      return;
    }
    A.close();
    if (bl._flashcards && bl._flashcards.length && A.kind === 'flashcards') { try { bl.exitFlashcards(); } catch (e) { } }
    else { try { bl.quitQuiz(); } catch (e) { } }
  };

  /* ── boot: engine-safe wraps — every practice session opens the dedicated page ── */
  function boot() {
    var bl = B();
    if (!bl) { setTimeout(boot, 300); return; }
    if (bl.__actWrapped) return;
    bl.__actWrapped = true;

    /* any practice session (all modes) → dedicated page.
       Mocks normally never reach here (their own page intercepts earlier)
       except the Current-Affairs 30+ direct-mock, which gets this shell. */
    var oStart = bl._startPlayer;
    bl._startPlayer = function (opts) {
      var r = oStart.apply(this, arguments);
      /* never hijack the DEDICATED MOCK page's own sessions (TP sets _fromTP
         around its startQuizSession call); anything else gets this page */
      var tpBusy = TP().active || TP()._fromTP || M().active;
      try { if (!tpBusy) A.onSession(opts); } catch (e) { }
      return r;
    };

    /* result page: v7 premium result renders into #bl-tp-area (container
       preference) — rebind Retry/Exit to the dedicated page's own behavior */
    var oFinish = bl._finishQuiz;
    bl._finishQuiz = function () {
      var r = oFinish.apply(this, arguments);
      try {
        if (A.active && A.kind !== 'flashcards') {
          A.resultMode = true;
          var area = document.getElementById('bl-tp-area');
          if (area) {
            var rb = area.querySelector('.bl-result-retry');
            if (rb) rb.onclick = A.retry;
            var xb = area.querySelector('.bl-result-exit');
            if (xb) xb.onclick = A.exitResult;
          }
        }
      } catch (e) { }
      return r;
    };

    /* flashcards: capture topic, open the dedicated flashcard page */
    var oTFC = bl.startTopicFlashcards;
    bl.startTopicFlashcards = function (topic) {
      A._fcTopic = topic;
      return oTFC.apply(this, arguments);
    };
    var oFC = bl.startFlashcards;
    bl.startFlashcards = function (cards) {
      var topic = A._fcTopic; A._fcTopic = null;
      var r = oFC.apply(this, arguments);
      try { A.onFlashcards(topic, cards); } catch (e) { }
      return r;
    };
    var oXFC = bl.exitFlashcards;
    bl.exitFlashcards = function () {
      var r = oXFC.apply(this, arguments);
      try { if (A.active && A.kind === 'flashcards') { A.close(); } } catch (e) { }
      return r;
    };
  }
  boot();
})();
