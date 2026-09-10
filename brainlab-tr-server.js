/* ════════════════════════════════════════════════════════════════
   brainlab-tr-server.js — Bilingual Translation Fallback (Assamese)
   ════════════════════════════════════════════════════════════════
   Server-side translation cache for BrainLab questions.

   DISPLAY PRIORITY (per question, in Assamese mode):
     1. Verified Assamese content already on the question
        (question_as + opt_*_as) — handled by the existing display layer.
     2. Reviewed/Verified translation from the persistent server cache.
     3. Auto machine translation — generated SERVER-SIDE (euTranslate
        backend, public Google endpoint, no API keys/secrets anywhere),
        persisted with status='auto', then displayed with an honest
        "স্বয়ংক্ৰিয় অনুবাদ" badge (never labelled verified/official).
     4. Temporary failure → honest unavailable notice + original
        English content (the existing fallback path).

   CONTENT INTEGRITY:
     - English originals are NEVER overwritten.
     - The question row is NEVER modified — translation rows live in a
       separate QuestionTranslation entity keyed by a content hash.
     - No duplicate question records: question_id stays the same.
     - Cached translations are reused across all users/sessions (server
       cache) + this device (localStorage mirror).

   ADDITIVE: patches BrainLabTranslate.translateQuestionAsync (used by the
   learn player) so the server cache is consulted before the legacy
   client-side path; the mock/test-page player calls window.BLTR.ensure
   directly. Zero engine/scoring/auth/payment changes.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var T = window.BLTR = {
    endpoint: 'https://vesper-501c3886.base44.app/functions/euTranslate',
    _lsKey: 'bl_tr_server_cache',
    _mem: {},   /* session cache: key -> translation */
    _pend: {},  /* in-flight dedupe: key -> [callbacks] */
    _seq: 0     /* prefetch generation (increment cancels) */
  };

  var ls = {};
  try { ls = JSON.parse(localStorage.getItem(T._lsKey) || '{}'); } catch (e) { ls = {}; }
  function saveLS() {
    try {
      var k = Object.keys(ls);
      if (k.length > 400) k.slice(0, k.length - 400).forEach(function (x) { delete ls[x]; });
      localStorage.setItem(T._lsKey, JSON.stringify(ls));
    } catch (e) {}
  }

  /* stable content-hash key of the original English question text —
     same question → same key everywhere (resume, other devices, mocks) */
  T.hashKey = function (text) {
    var s = String(text || '').trim();
    var h = 5381;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff; }
    return (h >>> 0).toString(16) + '-' + s.length;
  };

  /* quiz-shaped question → translation payload */
  T.itemFor = function (q) {
    return {
      key: T.hashKey(q.question_text),
      question: q.question_text,
      optA: q.option_a || '', optB: q.option_b || '',
      optC: q.option_c || '', optD: q.option_d || '',
      explanation: q.explanation || ''
    };
  };

  function api(body) {
    return fetch(T.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  /* batch cache read → fills memory + localStorage mirror */
  T.getMany = function (keys) {
    return api({ op: 'get', keys: keys }).then(function (d) {
      if (!d || !d.ok) return {};
      var tr = d.tr || {};
      Object.keys(tr).forEach(function (k) { T._mem[k] = tr[k]; ls[k] = tr[k]; });
      saveLS();
      return tr;
    });
  };

  /* ensure ONE question has an Assamese translation (priority:
     memory/localStorage → server cache → server generation).
     cb(tr | null) — tr = {question,optA..optD,explanation,status,source} */
  T.ensure = function (q, cb) {
    if (!q || !q.question_text) { cb(null); return; }
    if (q.question_as && String(q.question_as).length > 2) { cb(null); return; } /* verified AS exists — display layer handles it */
    var it = T.itemFor(q), key = it.key;
    if (T._mem[key]) { cb(T._mem[key]); return; }
    if (ls[key]) { T._mem[key] = ls[key]; cb(ls[key]); return; }
    if (T._pend[key]) { T._pend[key].push(cb); return; }
    T._pend[key] = [cb];
    function deliver(tr) {
      var cbs = T._pend[key] || []; delete T._pend[key];
      cbs.forEach(function (c) { c(tr); });
    }
    T.getMany([key]).then(function (tr) {
      if (tr && tr[key]) { deliver(tr[key]); return; }
      api({ op: 'translate', items: [it] }).then(function (d) {
        if (d && d.ok && d.tr && d.tr[key]) {
          T._mem[key] = d.tr[key]; ls[key] = d.tr[key]; saveLS();
          deliver(d.tr[key]);
        } else deliver(null);
      }).catch(function () { deliver(null); });
    }).catch(function () { deliver(null); });
  };

  /* background warm-up for a whole mock/quiz — chunks of 10, cancellable;
     never blocks the test; already-translated questions are skipped */
  T.prefetch = function (qs) {
    var seq = ++T._seq;
    var seen = {};
    var items = (qs || []).filter(function (q) {
      return q && q.question_text && !(q.question_as && String(q.question_as).length > 2);
    }).map(T.itemFor).filter(function (it) {
      if (seen[it.key] || T._mem[it.key] || ls[it.key]) return false;
      seen[it.key] = 1; return true;
    });
    if (!items.length) return;
    var i = 0;
    function step() {
      if (seq !== T._seq || i >= items.length) return;
      var chunk = items.slice(i, i + 10);
      i += chunk.length;
      api({ op: 'translate', items: chunk })
        .then(function (d) {
          if (d && d.ok && d.tr) {
            Object.keys(d.tr).forEach(function (k) { T._mem[k] = d.tr[k]; ls[k] = d.tr[k]; });
            saveLS();
          }
        })
        .catch(function () {})
        .then(function () { setTimeout(step, 350); });
    }
    step();
  };

  /* cancel any running prefetch (e.g. language switched back to English) */
  T.stop = function () { T._seq++; };

  /* translation row → display object (same shape the players expect) */
  T.display = function (tr) {
    return {
      question: tr.question,
      options: { A: tr.optA, B: tr.optB, C: tr.optC, D: tr.optD },
      explanation: tr.explanation || '',
      needsTranslation: false,
      trStatus: tr.status
    };
  };

  /* ── learn-player hook: server cache BEFORE the legacy client-side
        path (BrainLabTranslate.translateQuestionAsync) ── */
  function install() {
    var BLT = window.BrainLabTranslate;
    if (!BLT || !BLT.translateQuestionAsync || BLT._trServerPatched) return;
    var origTQA = BLT.translateQuestionAsync;
    BLT._trServerPatched = true;
    BLT.translateQuestionAsync = function (q, lang, onDone) {
      if (lang !== 'as' || (q.question_as && q.question_as.length > 2)) {
        origTQA.call(BLT, q, lang, onDone);
        return;
      }
      T.ensure(q, function (tr) {
        if (tr) {
          q._trStatus = tr.status;
          var ci = ['a', 'b', 'c', 'd'].indexOf(q.correct_answer);
          var d = T.display(tr);
          d.correctText = d.options[String.fromCharCode(65 + (ci < 0 ? 0 : ci))];
          onDone(d);
        } else {
          origTQA.call(BLT, q, lang, onDone); /* legacy MyMemory fallback */
        }
      });
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
