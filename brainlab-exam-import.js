/* ════════════════════════════════════════════════════════════════
   brainlab-exam-import.js — Admin: Exam Universe Import (additive)
   ════════════════════════════════════════════════════════════════
   Safe bulk question/PYQ import pipeline for the Exam Universe:
   Upload/Parse → Validate → Duplicate Detection → Preview →
   Admin Confirm → Insert (Exam Universe backend: euImport) → Verification Report.
   Admin-only: writes are gated server-side (Supabase session verified
   against Studyria admin_users inside euImport/euManage). No migration.
   Imported rows start verified=false ("Needs Review") — only verified
   rows count toward public metrics. Existing engines untouched.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var A = window.BrainLabExamAdmin = { rows: [], exam: 'adre', list: [] };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function normQ(q) { return String(q || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 120); }

  /* ── Exam Universe backend (Base44) — admin-gated euImport/euManage ── */
  var EU_API = 'https://vesper-501c3886.base44.app/functions/';
  function adminToken() {
    var sb = window.supabase || window.supabaseClient;
    if (!sb || !sb.auth || !sb.auth.getSession) return Promise.resolve(null);
    return sb.auth.getSession().then(function (r) { return (r && r.data && r.data.session && r.data.session.access_token) || null; }).catch(function () { return null; });
  }
  function euApi(fn, body) {
    return adminToken().then(function (t) {
      if (!t) throw new Error('Admin session not found — sign in to the Admin Panel first.');
      return fetch(EU_API + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ adminToken: t }, body || {})) });
    }).then(function (r) { return r.json(); });
  }
  var V3_VARIANTS = ['adre-driver', 'adre4-viii'];
  function exams() { var base = (window.BrainLabV7 && window.BrainLabV7.EXAM_HUB) ? window.BrainLabV7.EXAM_HUB.map(function (e) { return e.id; }) : ['adre', 'apsc', 'police', 'tet', 'ssc', 'dhs', 'other']; return base.concat(V3_VARIANTS.filter(function (v) { return base.indexOf(v) === -1; })); }

  function buildBankHashes() {
    var h = {};
    (window.STUDYRIA_QB || []).forEach(function (q) { h[normQ(q[0])] = 1; });
    return h;
  }
  function parseCSV(text) {
    var rows = [], cur = [''], inQ = false, r = 0;
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"' && text[i + 1] === '"') { cur[r] += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur[r] += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { cur.push(''); r++; }
      else if (ch === '\n') { rows.push(cur); cur = ['']; r = 0; }
      else cur[r] += ch;
    }
    rows.push(cur);
    if (!rows.length) return [];
    var head = rows[0].map(function (h2) { return h2.trim().toLowerCase(); });
    var need = ['question', 'opt_a', 'opt_b', 'opt_c', 'opt_d', 'answer', 'subject'];
    var idx = {}; head.forEach(function (h2, i) { idx[h2] = i; });
    var missing = need.filter(function (n) { return idx[n] === undefined; });
    if (missing.length) throw new Error('CSV missing required columns: ' + missing.join(', ') + '. Required: question,opt_a,opt_b,opt_c,opt_d,answer,subject (+ optional: topic,difficulty,explanation,source,year,paper,is_pyq,question_as,opt_a_as,opt_b_as,opt_c_as,opt_d_as)');
    var out = [];
    for (var j = 1; j < rows.length; j++) {
      var row = rows[j];
      if (!row.join('').trim()) continue;
      var o = {};
      for (var k in idx) o[k] = String(row[idx[k]] == null ? '' : row[idx[k]]).trim();
      out.push(o);
    }
    return out;
  }
  function normAnswer(a) {
    a = String(a || '').trim().toLowerCase();
    var map = { 'a': 'a', 'b': 'b', 'c': 'c', 'd': 'd', '1': 'a', '2': 'b', '3': 'c', '4': 'd' };
    return map[a] || null;
  }

  /* ── pipeline: parse → validate → dedupe → preview ── */
  A.process = function (rawItems, srcLabel) {
    var bank = buildBankHashes();
    var seen = {};
    var valid = [], dupBank = 0, dupFile = 0, invalid = 0, invRows = [];
    rawItems.forEach(function (o) {
      var q = o.question || o.question_text;
      if (!q || !o.opt_a || !o.opt_b || !o.opt_c || !o.opt_d) { invalid++; invRows.push(['missing question/options', (q || '').slice(0, 50)]); return; }
      var ans = normAnswer(o.answer);
      if (!ans) { invalid++; invRows.push(['answer must be a/b/c/d (or 1-4)', q.slice(0, 50)]); return; }
      if (!o.subject) { invalid++; invRows.push(['missing subject', q.slice(0, 50)]); return; }
      var nq = normQ(q);
      if (bank[nq]) { dupBank++; return; }
      if (seen[nq]) { dupFile++; return; }
      seen[nq] = 1;
      var yr = parseInt(String(o.year || o.source_year || '').match(/\d{4}/) ? String(o.year || o.source_year).match(/\d{4}/)[0] : '', 10);
      valid.push({
        exam_id: A.exam, subject: o.subject, topic: o.topic || 'General', difficulty: o.difficulty || 'medium',
        language: o.language || 'en',
        question_text: q, opt_a: o.opt_a, opt_b: o.opt_b, opt_c: o.opt_c, opt_d: o.opt_d, answer: ans,
        explanation: o.explanation || '', question_as: o.question_as || '',
        opt_a_as: o.opt_a_as || '', opt_b_as: o.opt_b_as || '', opt_c_as: o.opt_c_as || '', opt_d_as: o.opt_d_as || '',
        source_name: o.source || o.source_name || '', source_year: yr || null,
        paper_name: o.paper || '', is_pyq: String(o.is_pyq || '').toLowerCase() === 'true' || o.is_pyq === true || o.is_pyq === 1
      });
    });
    A.rows = valid;
    A.report = { total: rawItems.length, valid: valid.length, dupBank: dupBank, dupFile: dupFile, invalid: invalid, invRows: invRows.slice(0, 8), src: srcLabel };
    A.renderPreview();
  };

  A.upload = function (input) {
    var f = input.files && input.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var txt = String(rd.result);
        if (/\.json$/i.test(f.name) || /^\s*[\[{]/.test(txt)) {
          var data = JSON.parse(txt);
          if (!Array.isArray(data)) data = data.questions || (data.rows) || [];
          if (!Array.isArray(data)) throw new Error('JSON must be an array of question objects (or {questions:[…]}).');
          A.process(data, f.name);
        } else {
          A.process(parseCSV(txt), f.name);
        }
      } catch (e) { A.msg('❌ ' + e.message, true); }
      input.value = '';
    };
    rd.readAsText(f);
  };
  A.paste = function () {
    var t = document.getElementById('bl-ei-paste');
    if (!t || !t.value.trim()) { A.msg('Paste JSON array or CSV text first.', true); return; }
    try {
      var txt = t.value.trim();
      if (/^[\[{]/.test(txt)) {
        var data = JSON.parse(txt);
        if (!Array.isArray(data)) data = data.questions || [];
        if (!Array.isArray(data)) throw new Error('JSON must be an array.');
        A.process(data, 'pasted JSON');
      } else A.process(parseCSV(txt), 'pasted CSV');
    } catch (e) { A.msg('❌ ' + e.message, true); }
  };

  /* ── confirm → batch insert → verification report ── */
  A.confirm = async function () {
    if (!A.rows.length) { A.msg('Nothing valid to import.', true); return; }
    var btn = document.getElementById('bl-ei-go'); if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
    var res;
    try { res = await euApi('euImport', { rows: A.rows }); }
    catch (e) { A.msg('❌ ' + e.message, true); if (btn) { btn.disabled = false; btn.textContent = 'CONFIRM IMPORT'; } return; }
    if (btn) { btn.disabled = false; }
    if (!res || res.ok !== true) { A.msg('❌ Import failed: ' + ((res && res.error) || 'unknown error'), true); return; }
    A.rows = [];
    A.render();
    A.msg('✅ IMPORTED: ' + res.imported + ' · FAILED: ' + (res.failed || 0) + ((res.errors && res.errors.length) ? ' — ' + res.errors[0] : '')
      + ' — rows are saved as NEEDS REVIEW. Verify them below to make them live on Exam Universe.', !!res.failed && !res.imported);
    A.loadList();
  };

  /* ── existing rows manager ── */
  A.loadList = async function () {
    var res;
    try { res = await euApi('euManage', { op: 'list' }); } catch (e) { return; }
    if (!res || res.ok !== true) { A.msg('Could not load existing rows: ' + ((res && res.error) || 'admin session required'), true); return; }
    A.list = ((res && res.rows) || []).map(function (r) {
      return { id: r.id, exam_id: r.exam, question_text: r.question, subject: r.subject, is_pyq: r.isPyq, source_year: r.sourceYear, verified: r.verified };
    });
    A.renderList();
  };
  A.verify = async function (id, val) {
    if (!id) return;
    var res;
    try { res = await euApi('euManage', { op: 'verify', id: id, value: !!val }); } catch (e) { A.msg(e.message, true); return; }
    if (!res || res.ok !== true) { A.msg((res && res.error) || 'Verify failed', true); } else A.loadList();
  };
  A.verifyAll = async function () {
    var pend = A.list.filter(function (r) { return !r.verified; });
    if (!pend.length) { A.msg('No pending rows.'); return; }
    var res;
    try { res = await euApi('euManage', { op: 'verifyAllPending' }); } catch (e) { A.msg(e.message, true); return; }
    if (!res || res.ok !== true) { A.msg((res && res.error) || 'Verify failed', true); return; }
    A.msg('✅ Verified ' + (res.verified || 0) + ' rows — they are now live on Exam Universe.');
    A.loadList();
  };
  A.del = async function (id) {
    if (!id || !confirm('Delete this question permanently?')) return;
    var res;
    try { res = await euApi('euManage', { op: 'delete', id: id }); } catch (e) { A.msg(e.message, true); return; }
    if (!res || res.ok !== true) { A.msg((res && res.error) || 'Delete failed', true); } else A.loadList();
  };

  /* ── UI ── */
  A.msg = function (t, err) { var m = document.getElementById('bl-ei-msg'); if (m) { m.innerHTML = t; m.className = 'bl-ei-msg' + (err ? ' err' : ''); } };

  /* ── Exam Cycles manager (data-driven cycles — admin updates without code changes) ── */
  A.cycles = [];
  A.loadCycles = async function () {
    try { var res = await euApi('euManage', { op: 'cycleList' }); A.cycles = (res && res.rows) || []; }
    catch (e) { A.cycles = []; }
    A.renderCycles();
  };
  A.renderCycles = function () {
    var el = document.getElementById('bl-ei-cycles'); if (!el) return;
    var orgs = (window.BrainLabUniverse && window.BrainLabUniverse.ORGS) ? window.BrainLabUniverse.ORGS.map(function (o) { return o.id; }) : ['adr', 'police', 'apsc', 'tet', 'dhs', 'ssc', 'other'];
    var h = '<div style="display:flex;gap:8px;margin:6px 0 10px"><button class="bl-ei-btn ghost" onclick="BrainLabExamAdmin.loadCycles()">↻ Refresh</button>'
      + '<button class="bl-ei-btn" onclick="BrainLabExamAdmin.editCycle(-1)">＋ Add Cycle</button></div>';
    if (!A.cycles.length) { el.innerHTML = h + '<div class="bl-ei-empty">No exam cycles yet — cycles power the exam-version structure (e.g. ADRE 1.0 · 2022, ADRE 3.0 · Upcoming).</div>'; return; }
    A.cycles.forEach(function (c, i) {
      h += '<div class="bl-ei-row"><div style="flex:1;min-width:0">'
        + '<div style="font-size:.74rem;font-weight:700">' + esc(c.cycleName) + ' · ' + esc(c.organizationId) + (c.year ? ' · ' + c.year : ' · Year TBA') + '</div>'
        + '<div style="font-size:.62rem;opacity:.7">' + (c.status === 'upcoming' ? '🟡 Upcoming' : '✅ Active/Held') + ' · ' + (c.active ? 'visible' : 'hidden') + (c.examDate ? ' · exam ' + esc(c.examDate) : '') + '</div></div>'
        + '<button class="bl-ei-mini" onclick="BrainLabExamAdmin.editCycle(' + i + ')">Edit</button>'
        + '<button class="bl-ei-mini" onclick="BrainLabExamAdmin.delCycle(' + i + ')">Delete</button></div>';
    });
    h += '<div class="bl-ei-inv" style="font-size:.62rem;opacity:.75;margin-top:6px">Edit fields: cycle name, organization, year (leave empty for upcoming), status, exam/application dates, description, official source + URL. Changes go live on Exam Universe instantly — no frontend deploy needed.</div>';
    el.innerHTML = h;
  };
  A.editCycle = function (i) {
    var c = i >= 0 ? A.cycles[i] : { organizationId: 'adr', status: 'upcoming' };
    var orgs = (window.BrainLabUniverse && window.BrainLabUniverse.ORGS) ? window.BrainLabUniverse.ORGS.map(function (o) { return o.id; }) : ['adr', 'police', 'apsc', 'tet', 'dhs', 'ssc', 'other'];
    var el = document.getElementById('bl-ei-cycleform'); if (!el) return;
    el.style.display = '';
    el.innerHTML = '<div class="bl-ei-card" style="margin-bottom:10px">'
      + '<div style="font-size:.78rem;font-weight:800;margin-bottom:6px">' + (c.id ? 'Edit cycle — ' + esc(c.cycleName) : 'New exam cycle') + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'
      + '<input id="bl-ec-name" class="bl-ei-inp" placeholder="Cycle name (e.g. ADRE 3.0)" value="' + esc(c.cycleName || '') + '">'
      + '<select id="bl-ec-org" class="bl-ei-inp">' + orgs.map(function (o) { return '<option value="' + o + '"' + (c.organizationId === o ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>'
      + '<input id="bl-ec-year" class="bl-ei-inp" placeholder="Year (empty = to be announced)" value="' + (c.year || '') + '">'
      + '<select id="bl-ec-status" class="bl-ei-inp"><option value="active"' + (c.status === 'active' ? ' selected' : '') + '>active (held)</option><option value="upcoming"' + (c.status === 'upcoming' ? ' selected' : '') + '>upcoming</option></select>'
      + '<input id="bl-ec-examdate" class="bl-ei-inp" placeholder="Exam date (if officially announced)" value="' + esc(c.examDate || '') + '">'
      + '<input id="bl-ec-appdate" class="bl-ei-inp" placeholder="Application date (optional)" value="' + esc(c.applicationDate || '') + '">'
      + '</div>'
      + '<input id="bl-ec-desc" class="bl-ei-inp" style="width:100%;margin-top:6px" placeholder="Description" value="' + esc(c.description || '') + '">'
      + '<input id="bl-ec-src" class="bl-ei-inp" style="width:100%;margin-top:6px" placeholder="Official source (authoritative only)" value="' + esc(c.officialSource || '') + '">'
      + '<input id="bl-ec-srcurl" class="bl-ei-inp" style="width:100%;margin-top:6px" placeholder="Official source URL" value="' + esc(c.officialSourceUrl || '') + '">'
      + '<div style="display:flex;gap:8px;margin-top:8px"><button class="bl-ei-btn" onclick="BrainLabExamAdmin.saveCycle(' + (i >= 0 ? i : -1) + ')">💾 SAVE CYCLE</button>'
                  + '<button class="bl-ei-btn ghost" onclick="var f=document.getElementById(\'bl-ei-cycleform\');if(f)f.style.display=\'none\'">Cancel</button></div>'
      + '</div>';
  };
  A.saveCycle = async function (i) {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var yearRaw = g('bl-ec-year');
    var cyc = {
      id: (i >= 0 && A.cycles[i]) ? A.cycles[i].id : undefined,
      cycleName: g('bl-ec-name') || 'Unnamed Cycle',
      organizationId: g('bl-ec-org') || 'adr',
      year: yearRaw === '' ? null : Number(yearRaw),
      status: g('bl-ec-status') || 'upcoming',
      description: g('bl-ec-desc'),
      examDate: g('bl-ec-examdate') || null,
      applicationDate: g('bl-ec-appdate') || null,
      officialSource: g('bl-ec-src') || null,
      officialSourceUrl: g('bl-ec-srcurl') || null
    };
    if (cyc.year && (isNaN(cyc.year) || cyc.year < 1990 || cyc.year > 2100)) { A.msg('❌ Year must be a valid year (or empty for upcoming).', true); return; }
    var res;
    try { res = await euApi('euManage', { op: 'cycleSave', cycle: cyc }); } catch (e) { A.msg('❌ ' + e.message, true); return; }
    if (!res || res.ok !== true) { A.msg('❌ ' + ((res && res.error) || 'Save failed'), true); return; }
    A.msg('✅ Cycle saved — ' + (res.action === 'created' ? 'created' : 'updated') + '. It is live on Exam Universe.');
    document.getElementById('bl-ei-cycleform').style.display = 'none';
    A.loadCycles();
  };
  A.delCycle = async function (i) {
    var c = A.cycles[i]; if (!c || !confirm('Delete cycle "' + c.cycleName + '"? It will be hidden from Exam Universe.')) return;
    var res;
    try { res = await euApi('euManage', { op: 'cycleDelete', id: c.id }); } catch (e) { A.msg('❌ ' + e.message, true); return; }
    if (!res || res.ok !== true) { A.msg('❌ ' + ((res && res.error) || 'Delete failed'), true); return; }
    A.msg('✅ Cycle deleted.');
    A.loadCycles();
  };
  A.render = function () {
    var el = document.getElementById('bl-examimport-content'); if (!el) return;
    var examOpts = exams().map(function (id) { return '<option value="' + id + '"' + (A.exam === id ? ' selected' : '') + '>' + id + '</option>'; }).join('');
    el.innerHTML = ''
      + '<h3 style="margin:0 0 4px;font-size:1.05rem;font-weight:800">📥 Exam Universe Import</h3>'
      + '<p style="font-size:.78rem;opacity:.75;margin:0 0 14px">Safe bulk import of verified questions &amp; PYQs. Pipeline: Upload → Parse → Validate → Duplicate Detection → Preview → Confirm → Insert → Report. Stored in the Exam Universe backend (server-side admin-gated) — no database migration needed. Imported rows are <b>Needs Review</b> until you verify them — only verified rows go live.</p>'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">'
      + '<label style="font-size:.78rem;font-weight:700">Exam:</label>'
      + '<select id="bl-ei-exam" class="bl-ei-inp" onchange="BrainLabExamAdmin.exam=this.value">' + examOpts + '</select>'
      + '<input type="file" accept=".json,.csv" class="bl-ei-inp" onchange="BrainLabExamAdmin.upload(this)">'
      + '</div>'
      + '<textarea id="bl-ei-paste" class="bl-ei-inp" style="width:100%;height:90px;font-size:.72rem" placeholder="…or paste JSON array / CSV text here"></textarea>'
      + '<div style="display:flex;gap:8px;margin:8px 0"><button class="bl-ei-btn" onclick="BrainLabExamAdmin.paste()">PARSE &amp; PREVIEW</button>'
      + '<a class="bl-ei-btn ghost" download="exam-import-template.csv" href="data:text/csv;charset=utf-8,' + encodeURIComponent('question,opt_a,opt_b,opt_c,opt_d,answer,subject,topic,difficulty,explanation,source,year,paper,is_pyq\nWhich city is Assam\'s capital?,"Dispur","Guwahati","Jorhat","Silchar",a,General Knowledge,Assam GK,easy,"Dispur is the capital region of Guwahati.",ADRE,2024,Paper 1,true') + '">⬇ CSV template</a></div>'
      + '<div id="bl-ei-preview"></div><div id="bl-ei-msg" class="bl-ei-msg"></div>'
      + '<h3 style="margin:18px 0 8px;font-size:.95rem;font-weight:800">🏛️ Exam Cycles</h3><div id="bl-ei-cycles"></div><div id="bl-ei-cycleform" style="display:none"></div>'      + '<h3 style="margin:18px 0 8px;font-size:.95rem;font-weight:800">🗂 Existing imported questions</h3>'
      + '<div style="display:flex;gap:8px;margin-bottom:8px"><button class="bl-ei-btn ghost" onclick="BrainLabExamAdmin.loadList()">↻ Refresh</button>'
      + '<button class="bl-ei-btn" onclick="BrainLabExamAdmin.verifyAll()">✅ Verify all pending</button></div>'
      + '<div id="bl-ei-list"></div>';
    A.renderList();
    A.loadList();
    A.loadCycles();
  };
  A.renderPreview = function () {
    var p = document.getElementById('bl-ei-preview'); if (!p) return;
    var r = A.report;
    var h = '<div class="bl-ei-card"><div class="bl-ei-rep">'
      + '<span>📄 ' + r.total + ' parsed</span>'
      + '<span class="ok">✅ ' + r.valid + ' valid</span>'
      + '<span class="warn">🔁 ' + (r.dupBank + r.dupFile) + ' duplicates (bank ' + r.dupBank + ' / file ' + r.dupFile + ')</span>'
      + '<span class="err">⚠️ ' + r.invalid + ' invalid</span>'
      + '</div>';
    if (r.invRows.length) {
      h += '<div class="bl-ei-inv">Invalid reasons:</div>'
        + r.invRows.map(function (x) { return '<div class="bl-ei-invrow">• ' + esc(x[0]) + ' — <i>' + esc(x[1]) + '</i></div>'; }).join('');
    }
    if (r.valid) {
      h += '<div class="bl-ei-inv">Preview (first 5 of ' + r.valid + '):</div>';
      r.valid.slice ? r.valid.slice(0, 5).forEach(function (v) {
        h += '<div class="bl-ei-invrow">• [' + v.exam_id + '/' + (v.is_pyq ? 'PYQ' : 'MCQ') + '] ' + esc(v.question_text.slice(0, 90)) + ' → <b>' + v.answer.toUpperCase() + '</b></div>';
      }) : '';
      h += '<div style="margin-top:10px"><button id="bl-ei-go" class="bl-ei-btn" onclick="BrainLabExamAdmin.confirm()">CONFIRM IMPORT (' + r.valid + ' rows → ' + A.exam + ', as Needs Review)</button></div>';
    }
    h += '</div>';
    p.innerHTML = h;
  };
  A.renderList = function () {
    var l = document.getElementById('bl-ei-list'); if (!l) return;
    if (!A.list.length) { l.innerHTML = '<div class="bl-ei-empty">No imported questions yet.</div>'; return; }
    var pend = A.list.filter(function (r) { return !r.verified; }).length;
    var h = '<div class="bl-ei-rep" style="margin-bottom:8px"><span>Loaded: ' + A.list.length + '</span><span class="warn">' + pend + ' pending review</span><span class="ok">' + (A.list.length - pend) + ' verified</span></div>';
    A.list.slice(0, 50).forEach(function (r) {
      h += '<div class="bl-ei-row"><div style="flex:1;min-width:0"><div style="font-size:.74rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.question_text.slice(0, 110)) + '</div>'
        + '<div style="font-size:.62rem;opacity:.7">' + esc(r.exam_id) + ' · ' + esc(r.subject) + (r.is_pyq ? ' · PYQ' + (r.source_year ? ' ' + r.source_year : '') : ' · MCQ') + '</div></div>'
        + '<span class="bl-ei-tag ' + (r.verified ? 'ok' : 'warn') + '">' + (r.verified ? 'VERIFIED' : 'REVIEW') + '</span>'
        + '<button class="bl-ei-mini" onclick="BrainLabExamAdmin.verify(' + r.id + ',' + (r.verified ? 'false' : 'true') + ')">' + (r.verified ? 'Unverify' : 'Verify') + '</button>'
        + '<button class="bl-ei-mini danger" onclick="BrainLabExamAdmin.del(' + r.id + ')">✕</button></div>';
    });
    if (A.list.length > 50) h += '<div class="bl-ei-empty">Showing first 50 of ' + A.list.length + '.</div>';
    l.innerHTML = h;
  };

  /* ── mount into Admin → BrainLab Manager (additive) ── */
  function mount() {
    var panel = document.getElementById('atab-brainlab-manager'); if (!panel) return;
    var bar = panel.querySelector('div[style*="flex"]'); /* buttons row */
    if (!bar || document.getElementById('bl-examimport-btn')) return;
    var b = document.createElement('button');
    b.id = 'bl-examimport-btn';
    b.className = 'focus-btn focus-btn-secondary';
    b.style = 'padding:8px 14px;font-size:.78rem';
    b.textContent = '📥 Exam Import';
    b.onclick = function () {
      var mine = document.getElementById('bl-examimport-content');
      var other = document.getElementById('brainlab-admin-content');
      if (!mine) {
        mine = document.createElement('div'); mine.id = 'bl-examimport-content';
        panel.appendChild(mine);
      }
      if (other) other.style.display = 'none';
      mine.style.display = '';
      A.render();
    };
    bar.appendChild(b);
    /* hide mine when a core section is opened */
    if (window.BrainLabAdmin && window.BrainLabAdmin.switchSection) {
      var orig = window.BrainLabAdmin.switchSection;
      window.BrainLabAdmin.switchSection = function (s) {
        var mine = document.getElementById('bl-examimport-content');
        if (mine) mine.style.display = 'none';
        var other = document.getElementById('brainlab-admin-content');
        if (other) other.style.display = '';
        return orig.apply(this, arguments);
      };
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else setTimeout(mount, 500);
  window.addEventListener('hashchange', function () { setTimeout(mount, 400); });
})();
