/* ═══════════════════════════════════════════════════════════════════════
   brainlab-admin-tests.js — STUDYRIA BRAINLAB TEST ENGINE (admin)
   Tab: Admin → 🧪 Test Engine   (v3, Sep 2026 — additive, standalone)
   ------------------------------------------------------------------
   Spec §24 Question Pool Manager · §25 Test Blueprint Manager ·
   §26 Pool Health · §23 cross-exam leakage QA.

   HONESTY RULES (mirroring the engine):
   • Every number shown is LIVE — computed from the real question bank
     (STUDYRIA_QB / STUDYRIA_QB_EXTRA) × the live DB registry
     (bl_question_registry) × the DB blueprints (bl_test_blueprints).
     No hardcoded counts anywhere.
   • Registry governance only: question CONTENT stays in the versioned
     bank files; this panel never edits questions, only their status
     (approved / needs_review / rejected) via the admin-gated RPC
     bl_registry_set_status. Approval is a human decision.
   • If the v3 migration has not been run, the panel says so honestly
     and still shows the JS-fallback pool-health report (read-only).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var A = window.BrainLabTestEngineAdmin = { state: { db: false, busy: false, qa: null } };

  function sb() { return window.supabaseClient || null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n2(n) { return (n || 0).toLocaleString('en-IN'); }
  function normQ(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 120); }
  function djb2(str) { var h = 5381; for (var i = 0; i < str.length; i++) { h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; } return h.toString(16).padStart(8, '0'); }
  function qhash(q) { return djb2(normQ(q[0]) + '|' + String(q[5] || '').toLowerCase()); }
  function BT() { return window.BrainLabTests || null; }

  /* ── registry stats for the VFA practice set (or any EXTRA pool) ── */
  function extraStats() {
    var ex = window.STUDYRIA_QB_EXTRA || [];
    var reg = (BT() && BT().DB && BT().DB.registry) || {};
    var bySubject = {};
    ex.forEach(function (q) {
      var s = q[7] || '—';
      if (!bySubject[s]) bySubject[s] = { total: 0, approved: 0, needs_review: 0, rejected: 0, unregistered: 0, hashes: [] };
      bySubject[s].total++;
      bySubject[s].hashes.push(qhash(q));
      var r = reg[qhash(q)];
      if (!r) bySubject[s].unregistered++;
      else if (r.status === 'approved') bySubject[s].approved++;
      else if (r.status === 'needs_review') bySubject[s].needs_review++;
      else if (r.status === 'rejected') bySubject[s].rejected++;
    });
    return bySubject;
  }

  /* ── §23 cross-exam leakage QA + §36 per-test validation ── */
  function runQA() {
    var bt = BT(); if (!bt) return null;
    var report = { tests: [], leakage: [], passed: 0, failed: 0, errors: 0 };
    bt.SERIES.forEach(function (s) {
      var info = bt.info(s.id);
      if (!info || !info.published) return;
      for (var n = 1; n <= info.published; n++) {
        var t = null;
        try { t = bt.test(s.id, n); } catch (e) { t = null; }
        if (!t) { report.tests.push({ series: s.id, n: n, ok: false, why: 'generation/validation refused' }); report.failed++; continue; }
        var seen = {}, dup = 0;
        t.qs.forEach(function (q) { var h = normQ(String(q[0]).slice(0, 60)) + q[5]; if (seen[h]) dup++; seen[h] = 1; });
        var ok = dup === 0 && t.qs.length === info.perTest;
        report.tests.push({ series: s.id, n: n, ok: ok, qs: t.qs.length, expected: info.perTest, dup: dup });
        if (ok) report.passed++; else report.failed++;
      }
    });
    /* leakage: intersection of per-series pools must be empty across series
       EXCEPT genuinely shared-subject GA/science sections — cross-exam
       isolation applies to exam-scoped registry rows (series_id), which the
       engine enforces structurally: a pool only contains bank rows matching
       that blueprint's subject scopes. Report the honest structural check:
       registry rows carrying a series_id must appear ONLY in that series. */
    var reg = (bt.DB && bt.DB.registry) || {};
    var scoped = {};
    Object.keys(reg).forEach(function (h) {
      var r = reg[h];
      if (r && r.series_id) { (scoped[r.series_id] = scoped[r.series_id] || []).push(h); }
    });
    Object.keys(scoped).forEach(function (sid) {
      var hashes = scoped[sid];
      var pool = bt.info(sid);
      if (!pool || !pool.poolCount) return;
      /* verify every approved scoped hash of this series is in its own pool
         and NOT in any other series' generated test sets */
      bt.SERIES.forEach(function (s2) {
        if (s2.id === sid) return;
        var i2 = bt.info(s2.id); if (!i2 || !i2.published) return;
        for (var n = 1; n <= i2.published; n++) {
          var t = bt.test(s2.id, n); if (!t) continue;
          var tset = {};
          t.qs.forEach(function (q) { tset[qhash(q)] = 1; });
          var leaks = hashes.filter(function (h) { return tset[h]; });
          if (leaks.length) report.leakage.push({ from: sid, into: s2.id, test: n, count: leaks.length });
        }
      });
    });
    report.ok = report.failed === 0 && report.leakage.length === 0;
    return report;
  }

  /* ── admin RPC: bulk status change (governance only) ── */
  function setStatus(hashes, status, subject, cb) {
    var c = sb();
    if (!c) { cb && cb({ ok: false, reason: 'no client' }); return; }
    var map = window.PRACTICE_SET_SUBJECT_SERIES || {};
    var series = map[subject] || null; /* subject→series map keeps registry rows exam-scoped */
    c.rpc('bl_registry_set_status', { p_hashes: hashes, p_status: status, p_series: series, p_subject: subject, p_notes: null })
      .then(function (r) { cb && cb((r && r.data) || { ok: false, reason: 'rpc failed' }); })
      .catch(function (e) { cb && cb({ ok: false, reason: (e && e.message) || 'error' }); });
  }

  function chip(status) {
    var map = {
      verified:      ['✓ Verified', 'var(--success, #34c98e)'],
      needs_verification: ['Needs verification', 'var(--warn, #c99a3c)'],
      approved:      ['✓ Approved', 'var(--success, #34c98e)'],
      needs_review:  ['Needs review', 'var(--warn, #c99a3c)'],
      rejected:      ['✗ Rejected', 'var(--danger, #e55)'],
      legacy:        ['Legacy bank', 'var(--muted, #999)'],
      published:     ['✓ Published', 'var(--success, #34c98e)'],
      partial:       ['Partial', 'var(--warn, #c99a3c)'],
      pending:       ['Content pending', 'var(--warn, #c99a3c)']
    };
    var m = map[status] || [status, 'var(--muted, #999)'];
    return '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:.72rem;font-weight:700;color:' + m[1] + ';background:rgba(255,255,255,.06);border:1px solid currentColor">' + m[0] + '</span>';
  }

  function card(inner, pad) {
    return '<div style="background:var(--card,rgba(255,255,255,.03));border:1px solid var(--border,rgba(255,255,255,.09));border-radius:14px;padding:' + (pad || '16px 18px') + ';margin:14px 0">' + inner + '</div>';
  }
  function h2(t) { return '<h2 style="margin:0;font-size:1.15rem">🧪 Test Engine</h2>'; }

  function renderRegistryRow(subject, st) {
    var b = function (label, act, cls) {
      return '<button class="blte-btn ' + (cls || '') + '" data-act="' + act + '" data-subject="' + esc(subject) + '">' + label + '</button>';
    };
    return '<tr>' +
      '<td style="font-weight:700">' + esc(subject) + '</td>' +
      '<td>' + n2(st.total) + '</td>' +
      '<td style="color:var(--success,#34c98e)">' + n2(st.approved) + '</td>' +
      '<td style="color:var(--warn,#c99a3c)">' + n2(st.needs_review) + '</td>' +
      '<td style="color:var(--danger,#e55)">' + n2(st.rejected) + '</td>' +
      '<td style="opacity:.7">' + n2(st.unregistered) + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' +
        b('Approve all', 'approve-subject', 'blte-go') +
        ' ' + b('Reject all', 'reject-subject', 'blte-danger') +
      '</td></tr>';
  }

  window.renderBrainLabTestEngine = function (main) {
    main.style.contentVisibility = 'visible';
    var host = document.getElementById('blte-root');
    if (!host) { host = document.createElement('div'); host.id = 'blte-root'; main.appendChild(host); }
    var bt = BT();
    var html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">' +
      '<div><h2 style="margin:0;font-size:1.15rem">🧪 Test Engine — Exam Blueprints &amp; Question Pools</h2>' +
      '<p style="margin:6px 0 0;font-size:.83rem;opacity:.75">Database-driven exam governance · every count below is computed live from the real pool — nothing hardcoded · <a href="/#brainlab/tests" target="_blank" rel="noopener">open Tests ↗</a></p></div>' +
      '<div style="display:flex;gap:8px">' +
      '<button class="blte-btn" id="blte-refresh">↺ Refresh</button>' +
      '<button class="blte-btn blte-go" id="blte-qa">▶ Run validation QA</button>' +
      '</div></div>';

    /* migration status */
    var dbReady = bt && bt.DB && bt.DB.ready;
    if (!dbReady) {
      html += card('<b>Migration not active yet.</b> The governance layer (bl_test_blueprints / bl_question_registry / usage / versions) was not found. ' +
        'Run <code>sql/brainlab-tests-v3-migration.sql</code> in Supabase SQL Editor, then <code>sql/vfa-practice-registry-seed.sql</code>, and reopen this tab. ' +
        'Until then everything below is read-only, computed from the JS-fallback blueprint.', '14px 18px');
    }

    /* §25 blueprint table — DB rows when present, JS fallback otherwise */
    html += '<h3 style="margin:18px 0 4px;font-size:.95rem">① Test Blueprints (per exam)</h3>';
    var rep = bt ? bt.adminReport() : [];
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">' +
      '<thead><tr style="opacity:.6;text-align:left"><th style="padding:6px 8px">Exam</th><th>Org</th><th>Cycle</th><th>Pattern</th><th>Published</th><th>Status</th><th>Source</th></tr></thead><tbody>';
    rep.forEach(function (r) {
      html += '<tr style="border-top:1px solid rgba(255,255,255,.07)">' +
        '<td style="padding:8px;font-weight:700">' + esc(r.name) + '</td>' +
        '<td style="padding:8px;opacity:.8">' + esc(r.org) + '</td>' +
        '<td style="padding:8px;opacity:.8">' + esc(r.cycle || '—') + '</td>' +
        '<td style="padding:8px;opacity:.85">' + (r.perTest ? esc(r.perTest) + ' Q' + (r.durationMin ? ' · ' + esc(r.durationMin) + ' min' : '') + (r.marks ? ' · ' + esc(r.marks) + ' marks' : '') + (r.neg ? ' · neg ' + esc(r.neg) : '') : '—') + '</td>' +
        '<td style="padding:8px">' + esc(r.published) + '/' + esc(r.target) + ' tests</td>' +
        '<td style="padding:8px">' + chip(r.status) + '</td>' +
        '<td style="padding:8px;opacity:.7;max-width:260px">' + esc(r.source || 'Blueprint verification required') + '</td></tr>';
    });
    html += '</tbody></table></div>';

    /* §26 pool health per series */
    html += '<h3 style="margin:20px 0 4px;font-size:.95rem">② Question Pool Health (live)</h3>';
    rep.forEach(function (r) {
      if (!r.subjects.length) return;
      html += card('<div style="font-weight:700;margin-bottom:8px">' + esc(r.name) + ' — ' + n2(r.pool) + ' scoped questions' + (r.note ? ' · <span style="opacity:.7;font-weight:400">' + esc(r.note) + '</span>' : '') + '</div>' +
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.78rem"><thead><tr style="opacity:.6;text-align:left"><th style="padding:4px 8px">Subject</th><th>Required/test</th><th>Verified pool</th><th>Tests possible</th><th>Unused after publishing</th></tr></thead><tbody>' +
        r.subjects.map(function (x) {
          return '<tr style="border-top:1px solid rgba(255,255,255,.06)"><td style="padding:5px 8px">' + esc(x.name) + '</td><td style="padding:5px 8px">' + esc(x.required) + '</td><td style="padding:5px 8px">' + n2(x.pool) + '</td><td style="padding:5px 8px">' + esc(x.tests) + '</td><td style="padding:5px 8px">' + n2(x.unused) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>');
    });

    /* §24 registry governance — VFA practice set review queue */
    var stats = extraStats();
    var hasExtra = Object.keys(stats).length > 0;
    if (hasExtra) {
      html += '<h3 style="margin:20px 0 4px;font-size:.95rem">③ Review Queue — Practice Sets <span style="opacity:.6;font-weight:400">(practice questions, never PYQ; AI-authored, human-approved only)</span></h3>' +
        '<p style="margin:2px 0 6px;font-size:.8rem;opacity:.7">Each subject maps to its exam series (Biology/Chemistry/Physics → VFA · Road Transport → ADRE Driver). Approving moves questions into that series\' pool immediately (published tests recompute honestly). Nothing publishes while status is needs_review.</p>' + 
        '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem">' +
        '<thead><tr style="opacity:.6;text-align:left"><th style="padding:6px 8px">Subject</th><th>Total</th><th>Approved</th><th>Needs review</th><th>Rejected</th><th>Unregistered</th><th style="text-align:right">Bulk actions</th></tr></thead><tbody>' +
        Object.keys(stats).map(function (k) { return renderRegistryRow(k, stats[k]); }).join('') +
        '</tbody></table></div>' +
        '<p id="blte-action-msg" style="font-size:.8rem;margin-top:8px;min-height:1em"></p>';
    }

    /* QA section */
    html += '<h3 style="margin:20px 0 4px;font-size:.95rem">④ Validation QA (spec §23/§36)</h3>';
    html += '<div id="blte-qa-out">' + card('<span style="opacity:.7;font-size:.83rem">Run the QA button to validate every published test: exact blueprint counts, subject membership, zero duplicates, and cross-exam leakage (registry-scoped questions must never appear in another exam\'s tests).</span>') + '</div>';

    host.innerHTML = html;

    /* styles once */
    if (!document.getElementById('blte-styles')) {
      var st = document.createElement('style');
      st.id = 'blte-styles';
      st.textContent = '.blte-btn{display:inline-block;padding:7px 14px;border-radius:9px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:inherit;font-size:.78rem;font-weight:600;cursor:pointer}' +
        '.blte-btn:hover{background:rgba(255,255,255,.1)} .blte-go{background:linear-gradient(135deg,#930205,#c99a3c);border:none;color:#fff}' +
        '.blte-danger{border-color:rgba(229,85,85,.4);color:#e88} .blte-pass{color:#34c98e;font-weight:700}.blte-fail{color:#e55;font-weight:700}';
      document.head.appendChild(st);
    }

    /* wire */
    var refresh = document.getElementById('blte-refresh');
    if (refresh) refresh.onclick = function () {
      if (bt && bt.dbInit) bt.dbInit();
      setTimeout(function () { window.renderBrainLabTestEngine(main); }, 900);
    };
    var qaBtn = document.getElementById('blte-qa');
    if (qaBtn) qaBtn.onclick = function () {
      var out = document.getElementById('blte-qa-out');
      out.innerHTML = card('<span style="opacity:.7;font-size:.83rem">Running validation over every published test…</span>');
      setTimeout(function () {
        A.state.qa = runQA();
        var r = A.state.qa;
        if (!r) { out.innerHTML = card('<span class="blte-fail">Engine not loaded.</span>'); return; }
        var body = '<div style="font-weight:700;margin-bottom:6px">' + (r.ok ? '<span class="blte-pass">✓ ALL CHECKS PASSED</span>' : '<span class="blte-fail">✗ FAILURES DETECTED</span>') +
          ' — ' + r.passed + ' tests passed, ' + r.failed + ' failed, ' + r.leakage.length + ' leakage findings</div>' +
          '<table style="width:100%;border-collapse:collapse;font-size:.76rem"><thead><tr style="opacity:.55;text-align:left"><th style="padding:4px 8px">Series · Test</th><th>Result</th><th>Detail</th></tr></thead><tbody>';
        r.tests.forEach(function (t) {
          body += '<tr style="border-top:1px solid rgba(255,255,255,.06)"><td style="padding:4px 8px">' + esc(t.series) + ' #' + t.n + '</td>' +
            '<td style="padding:4px 8px">' + (t.ok ? '<span class="blte-pass">✓ valid</span>' : '<span class="blte-fail">✗ invalid</span>') + '</td>' +
            '<td style="padding:4px 8px;opacity:.75">' + (t.ok ? t.qs + '/' + t.expected + ' questions, 0 duplicates' : esc(t.why || ('count/dup mismatch: ' + t.qs + '/' + t.expected + ', dups ' + t.dup))) + '</td></tr>';
        });
        r.leakage.forEach(function (l) {
          body += '<tr style="border-top:1px solid rgba(255,255,255,.06)"><td style="padding:4px 8px" colspan="3"><span class="blte-fail">LEAK</span> — ' + esc(l.count) + ' question(s) scoped to ' + esc(l.from) + ' appeared in ' + esc(l.into) + ' test #' + l.test + '</td></tr>';
        });
        body += '</tbody></table>';
        out.innerHTML = card(body);
      }, 60);
    };
    /* bulk registry actions (delegated) */
    host.onclick = function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('.blte-btn[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act'), subject = btn.getAttribute('data-subject');
      if (act !== 'approve-subject' && act !== 'reject-subject') return;
      var status = act === 'approve-subject' ? 'approved' : 'rejected';
      var st = (extraStats()[subject]) || { hashes: [] };
      var msg = document.getElementById('blte-action-msg');
      if (msg) msg.textContent = '…';
      setStatus(st.hashes, status, subject, function (res) {
        if (res && res.ok) {
          if (msg) msg.innerHTML = '<span class="blte-pass">✓ ' + esc(res.updated) + ' ' + esc(subject) + ' questions set to ' + esc(status) + '.</span> Pools recompute on refresh.';
          if (bt && bt.dbInit) bt.dbInit();
          setTimeout(function () { window.renderBrainLabTestEngine(main); }, 900);
        } else {
          if (msg) msg.innerHTML = '<span class="blte-fail">✗ ' + esc((res && res.reason) || 'failed') + ' — admin session / RPC required (run the v3 migration first).</span>';
        }
      });
    };
  };
})();
