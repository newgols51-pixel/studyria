/* ═══════════════════════════════════════════════════════════════════════
   brainlab-tests.js — STUDYRIA BRAINLAB "TESTS" MODULE (blueprint engine)
   ═══════════════════════════════════════════════════════════════════════
   v2 (Sep 14, 2026) — EXAM TEST BLUEPRINT SYSTEM (content-correctness fix).

   ROOT CAUSE this rewrite fixes: v1 drew EVERY series from a shared
   generic pool ("gsts": Assam GK/GK/English/Maths/Reasoning/Science) and
   computed per-test size from pool arithmetic — so e.g. Assam VFA tests
   contained random Maths/English/Reasoning questions, per-test counts were
   invented (never the official 100), and no series followed its real
   exam pattern.

   THE SYSTEM NOW (spec-compliant generation pipeline):
   • BT.BLUEPRINTS — per-exam VERIFIED official configuration: subject
     distribution (or officially-subject-only open pool), total questions,
     duration, marks, negative marking, source. Nothing is invented: every
     blueprint cites its authoritative source; exams whose pattern could
     NOT be verified are bp:null → needs_verification → NEVER published,
     shown only in Admin as "Blueprint verification required".
   • Exam-scoped question pools: each series classifies the REAL dedup'd
     bank (STUDYRIA_QB) through its blueprint's subject lists — one
     question belongs to exactly ONE section of that exam (hard isolation;
     no cross-subject or cross-section leakage inside a test).
   • Generation: per-section deterministic seeded slices, DISJOINT across
     tests of the same series (no question reuse while the pool allows),
     published = min(target, floor(pool/required)) per section — computed
     live. Insufficient pool → honestly fewer tests (Content Pending).
   • §12F validation on EVERY test before it can open: exact per-section
     counts, subject membership re-check, zero duplicate questions, exact
     total. A test failing any check is not published (openTest refuses).
   • Engine reuse (unchanged): same BrainLabTestPage + mock engine,
     activity_type mode='test'; blueprint duration (e.g. VFA 120 min)
     threads through to the attempt timer via durationMin.

   ZERO changes to: existing BrainLab modules, mock engine scoring,
   quizzes, MCQs, PYQs, flashcards, current affairs, exam hub, mistake
   book, arena, translation, auth, payment, PDF checkout. Additive only.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var BT = window.BrainLabTests = { _q: '', _f: 'all', _sort: 'rec' };

  function B() { return window.BrainLab; }
  function TP() { return window.BrainLabTestPage || {}; }
  function esc(s) { var bl = B(); return bl && bl.escape ? bl.escape(s) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function n2(n) { return (n || 0).toLocaleString('en-IN'); }

  /* deterministic seeded shuffle — identical algorithm to
     brainlab-exams.js seedShuffle (stable test sets across reloads) ── */
  function seedShuffle(arr, seedStr) {
    var h = 1779033703 ^ seedStr.length;
    for (var i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    function rnd() { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; }
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)); var t = a[j]; a[j] = a[k]; a[k] = t; }
    return a;
  }

  /* ═══════════════════ SUBJECT LIST CONSTANTS (bank q[7]/q[8] names) ═══════════════════
     These are the EXACT subject/category/topic names used in
     question-bank.js. A question enters a section only when q[7] or q[8]
     matches the section's list — never inferred from question text. */
  var MATH = ['Mathematics', 'Arithmetic', 'Algebra', 'Geometry', 'Number Theory', 'Percentage', 'Time and Distance', 'Simple Interest', 'Compound Interest', 'Profit and Loss', 'Ratio and Proportion', 'Average', 'Time and Work'];
  var ENGLISH = ['English', 'Vocabulary', 'Spelling', 'Grammar'];
  var REASONING = ['Reasoning', 'Series', 'Coding-Decoding', 'Classification', 'Number Logic', 'Calendar', 'Blood Relations', 'Direction Sense', 'Ranking'];
  var GA = ['Assam GK', 'General Knowledge', 'World GK', 'Indian GK', 'Sports', 'Persons', 'Inventions', 'Important Days', 'Arts', 'Literature', 'Nature', 'Polity', 'Indian Polity', 'History', 'Indian History', 'World History', 'Geography', 'Indian Geography', 'World Geography', 'Economy', 'Indian Economy', 'World Economy', 'Environment', 'Climate Change', 'Ecology', 'Conservation', 'Pollution', 'Energy'];
  var SCI = ['Biology', 'Chemistry', 'Physics', 'Astronomy'];
  /* Assam TET (LP) — CDP + Language I scopes. Cats used by the TET practice
     pools only; deliberately disjoint from GA/MATH/EVS lists (no topic of a
     CDP/Lang-I question may equal a GA/EVS keyword — authoring rule). */
  var CDP = ['Child Development & Pedagogy', 'Educational Psychology', 'Pedagogy'];
  var LANG1 = ['Language I (Assamese)', 'Assamese'];
  var EVS = ['Environment', 'Nature', 'Climate Change', 'Ecology', 'Conservation', 'Pollution', 'Energy', 'Science', 'Biology', 'Chemistry', 'Physics', 'Astronomy', 'Geography', 'Indian Geography', 'World Geography'];
  /* Social Studies (ADRE) — history/geography/polity/economy incl. Assam */
  var SOCIAL_STUDIES = ['History', 'Indian History', 'World History', 'Geography', 'Indian Geography', 'World Geography', 'Polity', 'Indian Polity', 'Economy', 'Indian Economy', 'World Economy'];
  function isAssamTopic(q, topics) { return String(q[7]) === 'Assam GK' && topics.indexOf(String(q[8])) !== -1; }
  var ASSAM_HGPE = ['Assam History', 'Assam Geography', 'Assam Polity', 'Assam Economy'];
  var ASSAM_HISTCULT = ['Assam History', 'Assam Culture'];

  function hasAny(list, q) { return list.indexOf(String(q[7] || '')) !== -1 || list.indexOf(String(q[8] || '')) !== -1; }

  /* ═══════════════════ EXAM TEST BLUEPRINTS (verified sources only) ═══════════════════
     dist: officially verified subject→question distribution. Each section:
       { k: display name, n: questions per test, match(q): section scope }
     open: official subjects WITHOUT an official per-subject count (APSC) —
       balanced subject-scoped pool, never presented as official weightage.
     durationMin/marks/neg/total — official values; durationConvention
     flags a practice-convention duration (official duration unconfirmed).
     source — the authoritative pattern source (spec §13).
     A series with bp:null is UNVERIFIED → never published (spec §12C). */
  BT.BLUEPRINTS = {
    /* Assam Police Sub-Inspector (UB) — SLPRB written-test pattern:
       OMR, 100 Q / 100 marks / 3 hours, negative 0.5; sections:
       Logical Reasoning, Aptitude & Comprehension 35; Culture & History
       of India & Assam 35; General Knowledge 30. Pattern corroborated
       across recruitment documentation of the SLPRB SI (UB) 2022
       written exam (slprbassam.in). */
    'sub-inspector': {
      cycle: 'SLPRB SI (UB) — 2022 written pattern', total: 100, durationMin: 180, marks: 100, neg: 0.5,
      source: 'SLPRB Assam SI (UB) official written-test pattern — corroborated (100 Q / 100 marks / 3 hrs / negative ½; LR-Aptitude-Comprehension 35, History & Culture of India & Assam 35, GK 30)',
      dist: [
        { k: 'Logical Reasoning, Aptitude & Comprehension', n: 35, match: function (q) { return hasAny(REASONING, q) || hasAny(MATH, q) || hasAny(ENGLISH, q); } },
        { k: 'Culture & History of India & Assam', n: 35, match: function (q) { return String(q[7]) === 'History' || String(q[8]) === 'Indian History' || String(q[8]) === 'World History' || isAssamTopic(q, ASSAM_HISTCULT); } },
        { k: 'General Knowledge', n: 30, match: function (q) { return hasAny(GA, q); } }
      ]
    },
    /* ADRE 2.0 (2024 cycle) — Grade-III HSSLC (Paper III): SLRC pattern
       released 15 Jul 2024: 150 Q / 150 marks / 180 min, negative 0.25;
       Social Studies 30, GK 30, Reasoning 20, English 35, Maths 35.
       Real Paper III questions exist in the ADRE PYQ module. */
    'adre-g3': {
      cycle: 'ADRE 2.0 (2024) · HSSLC Grade-III', total: 150, durationMin: 180, marks: 150, neg: 0.25,
      source: 'SLRC ASSEB ADRE 2.0 official pattern (15 Jul 2024) — Paper III HSSLC Grade-III: 150 Q / 150 marks / 180 min / neg 0.25; SS 30, GK 30, LR 20, Eng 35, Maths 35',
      dist: [
        { k: 'Social Studies', n: 30, match: function (q) { return hasAny(SOCIAL_STUDIES, q) || isAssamTopic(q, ASSAM_HGPE); } },
        { k: 'General Knowledge', n: 30, match: function (q) { return hasAny(GA, q); } },
        { k: 'Mental Ability & Logical Reasoning', n: 20, match: function (q) { return hasAny(REASONING, q); } },
        { k: 'General English', n: 35, match: function (q) { return hasAny(ENGLISH, q); } },
        { k: 'General Mathematics', n: 35, match: function (q) { return hasAny(MATH, q); } }
      ]
    },
    /* ADRE 2.0 — Grade-III Driver (Paper V): 150 Q / 150 marks / 180 min,
       neg 0.25; SS 20, GK 30, LR 20, Eng 30, Maths 30, Road Transport 20.
       Road Transport has NO bank pool yet → honest Content Pending. */
    'adre-g3-driver': {
      cycle: 'ADRE 2.0 (2024) · Driver Grade-III', total: 150, durationMin: 180, marks: 150, neg: 0.25,
      source: 'SLRC ASSEB ADRE 2.0 official pattern — Paper V Driver: 150 Q / 150 marks / 180 min / neg 0.25; SS 20, GK 30, LR 20, Eng 30, Maths 30, Road Transport 20 (Road Transport pool pending)',
      dist: [
        { k: 'Social Studies', n: 20, match: function (q) { return hasAny(SOCIAL_STUDIES, q) || isAssamTopic(q, ASSAM_HGPE); } },
        { k: 'General Knowledge', n: 30, match: function (q) { return hasAny(GA, q); } },
        { k: 'Mental Ability & Logical Reasoning', n: 20, match: function (q) { return hasAny(REASONING, q); } },
        { k: 'General English', n: 30, match: function (q) { return hasAny(ENGLISH, q); } },
        { k: 'General Mathematics', n: 30, match: function (q) { return hasAny(MATH, q); } },
        { k: 'Road Transport & Road Safety', n: 20, match: function (q) { return String(q[7]) === 'Road Transport' || String(q[8]) === 'Road Transport'; } }
      ]
    },
    /* ADRE 2.0 — Grade-IV HSLC/Class X (Paper I/II): 135 Q / 135 marks /
       150 min, neg 0.25; GK 30, SS 30, Eng 25, Maths 25, Reasoning 25
       (section counts as published in the SLRC pattern, reported
       approximate by pattern sources). */
    'adre-g4': {
      cycle: 'ADRE 2.0 (2024) · HSLC Grade-IV', total: 135, durationMin: 150, marks: 135, neg: 0.25,
      source: 'SLRC ASSEB ADRE 2.0 official pattern — Grade-IV (HSLC/Class X): 135 Q / 135 marks / 150 min / neg 0.25; GK 30, SS 30, Eng 25, Maths 25, Reasoning 25 (approx. per pattern sources)',
      dist: [
        { k: 'Social Studies', n: 30, match: function (q) { return hasAny(SOCIAL_STUDIES, q) || isAssamTopic(q, ASSAM_HGPE); } },
        { k: 'General Knowledge', n: 30, match: function (q) { return hasAny(GA, q); } },
        { k: 'General English', n: 25, match: function (q) { return hasAny(ENGLISH, q); } },
        { k: 'General Mathematics', n: 25, match: function (q) { return hasAny(MATH, q); } },
        { k: 'Mental Ability & Logical Reasoning', n: 25, match: function (q) { return hasAny(REASONING, q); } }
      ]
    },
    /* ADRE 2.0 — Grade-IV Class VIII (Paper II): same structure as the
       HSLC paper at SCERT elementary difficulty. */
    'adre-g4-viii': {
      cycle: 'ADRE 2.0 (2024) · Class VIII Grade-IV', total: 135, durationMin: 150, marks: 135, neg: 0.25,
      source: 'SLRC ASSEB ADRE 2.0 official pattern — Grade-IV (Class VIII/SCERT): 135 Q / 135 marks / 150 min / neg 0.25; GK 30, SS 30, Eng 25, Maths 25, Reasoning 25 (approx. per pattern sources)',
      dist: [
        { k: 'Social Studies', n: 30, match: function (q) { return hasAny(SOCIAL_STUDIES, q) || isAssamTopic(q, ASSAM_HGPE); } },
        { k: 'General Knowledge', n: 30, match: function (q) { return hasAny(GA, q); } },
        { k: 'General English', n: 25, match: function (q) { return hasAny(ENGLISH, q); } },
        { k: 'General Mathematics', n: 25, match: function (q) { return hasAny(MATH, q); } },
        { k: 'Mental Ability & Logical Reasoning', n: 25, match: function (q) { return hasAny(REASONING, q); } }
      ]
    },
    /* Assam Veterinary Field Assistant 2026 — official recruitment info:
       100 MCQs / 100 marks / 120 min; Biology 40, Chemistry 20, Physics 20,
       General Awareness 20. (Training curriculum ≠ written-test blueprint
       — kept separate, spec §10.) */
    vfa: {
      cycle: 'VFA 2026', total: 100, durationMin: 120, marks: 100, neg: 0,
      source: 'Official VFA 2026 recruitment information (assam.gov.in recruitment notice, verified Sep 2026)',
      dist: [
        { k: 'Biology', n: 40, match: function (q) { return String(q[7]) === 'Biology' || String(q[8]) === 'Biology'; } },
        { k: 'Chemistry', n: 20, match: function (q) { return String(q[7]) === 'Chemistry' || String(q[8]) === 'Chemistry'; } },
        { k: 'Physics', n: 20, match: function (q) { return String(q[7]) === 'Physics' || String(q[8]) === 'Physics'; } },
        { k: 'General Awareness', n: 20, match: function (q) { return hasAny(GA, q); } }
      ]
    },
    /* Assam Police Constable (AB/UB) — SLPRB official: written test 100 MCQs
       / 50 marks (0.5 per question), OMR; sections per SLPRB pattern:
       Elementary Arithmetic 20, General English 20, Logical Reasoning 20,
       Assam History-Geography-Polity-Economy 20, GK & Awareness 20. */
    'constable-abub': {
      cycle: 'Constable AB/UB', total: 100, durationMin: 100, durationConvention: true, marks: 50, neg: 0,
      source: 'SLPRB Assam Constable (AB/UB) official advertisement + pattern (100 Q / 50 marks); official duration not stated in sources — practice convention 1 min/question',
      dist: [
        { k: 'Elementary Arithmetic', n: 20, match: function (q) { return hasAny(MATH, q); } },
        { k: 'General English', n: 20, match: function (q) { return hasAny(ENGLISH, q); } },
        { k: 'Logical Reasoning', n: 20, match: function (q) { return hasAny(REASONING, q); } },
        { k: 'Assam History, Geography, Polity & Economy', n: 20, match: function (q) { var s = String(q[7]), t = String(q[8]); return s === 'Assam GK' && ['Assam History', 'Assam Geography', 'Assam Polity', 'Assam Economy'].indexOf(t) !== -1; } },
        { k: 'General Knowledge & Awareness', n: 20, match: function (q) { return hasAny(GA, q); } }
      ]
    },
    /* APSC CCE Prelims — General Studies Paper I (official apsc.nic.in):
       100 objective questions, 200 marks, 2 hours, negative 1/4th of the
       mark per question; GS subjects incl. 30–35% Assam-related. No
       official per-subject count → open subject-scoped pool (spec §12E). */
    'apsc-cce': {
      cycle: 'CCE Prelims · GS Paper I', total: 100, durationMin: 120, marks: 200, neg: 0.5,
      source: 'APSC CCE Prelims General Studies Paper I — official apsc.nic.in (100 Q, 200 marks, 2 hrs, negative 1/4th)',
      open: function (q) { return hasAny(GA, q) || hasAny(SCI, q) || String(q[7]) === 'Science' || String(q[7]) === 'Computer'; }
    },
    /* Assam TET (Lower Primary) — official pattern: 150 MCQs / 150 marks /
       150 min, five sections × 30: CDP, Language I, Language II (English),
       Mathematics, EVS. No negative marking. */
    'assam-tet': {
      cycle: 'Assam TET (LP)', total: 150, durationMin: 150, marks: 150, neg: 0,
      source: 'Assam TET official pattern — 150 Q, 150 marks, 150 min, five sections × 30 (LP paper)',
      dist: [
        { k: 'Child Development & Pedagogy', n: 30, match: function (q) { return hasAny(CDP, q); } },
        { k: 'Language I (Mother Tongue)', n: 30, match: function (q) { return hasAny(LANG1, q); } },
        { k: 'Language II (English)', n: 30, match: function (q) { return hasAny(ENGLISH, q); } },
        { k: 'Mathematics', n: 30, match: function (q) { return hasAny(MATH, q); } },
        { k: 'Environmental Studies', n: 30, match: function (q) { return hasAny(EVS, q); } }
      ]
    },
    /* SSC GD Constable CBE — official notification: 80 Q / 160 marks /
       60 min, four sections × 20 Q × 2 marks (Reasoning, GK & General
       Awareness, Elementary Mathematics, English); negative 0.25. */
    'ssc-gd': {
      cycle: 'SSC GD CBE', total: 80, durationMin: 60, marks: 160, neg: 0.25,
      source: 'SSC GD Constable official notification — 80 Q, 160 marks, 60 min, 4 sections × 20, negative 0.25',
      dist: [
        { k: 'General Intelligence & Reasoning', n: 20, match: function (q) { return hasAny(REASONING, q); } },
        { k: 'General Knowledge & General Awareness', n: 20, match: function (q) { return hasAny(GA, q); } },
        { k: 'Elementary Mathematics', n: 20, match: function (q) { return hasAny(MATH, q); } },
        { k: 'English', n: 20, match: function (q) { return hasAny(ENGLISH, q); } }
      ]
    },
    /* DHS Assam Grade-III (Non-Technical) — official advertisement
       (dhs.assam.gov.in, Sep 2025, 191 posts: Health Educator, Junior
       Assistant/Account Assistant cum LDA, BHW): OMR-based Written Test
       of 100 marks; convergent pattern reports: 100 MCQs / 100 marks /
       2 hours / no negative marking. Syllabus areas: General English,
       General Knowledge & Current Affairs, Reasoning & Mental Ability,
       Computer Knowledge. No official per-section counts → subject-
       scoped open pool (spec §12E), restricted to these four verified
       syllabus areas only (Numerical Aptitude appears in generic DHS
       reports, not the corroborated 191-post syllabus — excluded,
       fail-closed). */
    'dhs-assam-g3': {
      cycle: 'DHS Grade-III (NT)', total: 100, durationMin: 120, marks: 100, neg: 0,
      source: 'DHS Assam Grade-III (Non-Technical) official advertisement (dhs.assam.gov.in, Sep 2025) — OMR written test, 100 Q / 100 marks / 120 min, no negative; no official per-subject counts → subject-scoped open pool (spec §12E)',
      open: function (q) { return hasAny(GA, q) || hasAny(ENGLISH, q) || hasAny(REASONING, q) || String(q[7]) === 'Computer'; }
    }
  };

  /* ═══════════════════ SERIES REGISTRY (config-as-code) ═══════════════════
     bp — verified blueprint key (BT.BLUEPRINTS), or null → the exam's
     real pattern could NOT be verified → needs_verification → hidden from
     the app catalog, visible in Admin only (spec §12C). */
  BT.SERIES = [
    { id: 'vfa',            name: 'Assam VFA Exam',           org: 'Government of Assam',                      bp: 'vfa',            target: 20, icon: '🐄', search: 'vfa veterinary field assistant assam', desc: 'Assam VFA (Veterinary Field Assistant) recruitment exam — official pattern: Biology 40 · Chemistry 20 · Physics 20 · General Awareness 20.' },
    { id: 'constable-abub', name: 'Constable (AB/UB)',        org: 'Assam Police',                             bp: 'constable-abub', target: 12, icon: '👮', search: 'constable ab ub police assam', desc: 'Assam Police Constable (AB/UB) written-test series — SLPRB pattern: 100 Q · Arithmetic, English, Reasoning, Assam HGPE, GK.' },
    { id: 'apsc-cce',       name: 'APSC CCE Prelims',        org: 'APSC',                                     bp: 'apsc-cce',      target: 10, icon: '🎓', search: 'apsc cce prelims civil service assam', desc: 'APSC Combined Competitive (Prelims) General Studies Paper I — 100 Q · 120 min.' },
    { id: 'ssc-gd',         name: 'SSC GD',                  org: 'Staff Selection Commission',                bp: 'ssc-gd',        target: 10, icon: '🛡️', search: 'ssc gd general duty constable', desc: 'SSC GD (General Duty) CBE — official pattern: 80 Q · 60 min · 4 sections × 20.' },
    { id: 'assam-tet',      name: 'Assam TET (LP)',          org: 'Assam TET Authority',                       bp: 'assam-tet',     target: 10, icon: '🏫', search: 'tet lp lower primary teacher assam', desc: 'Assam TET Lower Primary — official pattern: 150 Q · 150 min · five sections × 30.' },
    /* ── needs_verification — real official pattern not yet verified.
       NEVER published as real-pattern tests until the blueprint above is
       verified (spec §12C/§13). Admin shows "Blueprint verification
       required". ── */
    { id: 'sub-inspector',  name: 'Sub Inspector',          org: 'Assam Police',                             bp: 'sub-inspector', target: 12, icon: '🚔', search: 'si sub inspector police assam', desc: 'Assam Police SI (UB) written test — SLPRB pattern: 100 Q · 3 hrs · LR-Aptitude-Comprehension 35, History & Culture 35, GK 30.' },
    { id: 'mts',            name: 'Multi Tasking Staff',     org: 'Government of Assam',                      bp: null, target: 16, icon: '🛠️', search: 'mts multi tasking staff assam govt', desc: 'Multi Tasking Staff (MTS) written-test practice series.' },
    { id: 'adre-g3',        name: 'ADRE Grade III',         org: 'Assam Direct Recruitment',                  bp: 'adre-g3', target: 10, icon: '🏛️', search: 'adre grade 3 iii slrc hsslc', desc: 'ADRE 2.0 Grade-III (HSSLC) — SLRC official pattern: 150 Q · 3 hrs · SS 30, GK 30, LR 20, English 35, Maths 35.' },
    { id: 'adre-g4',        name: 'ADRE Grade IV',          org: 'Assam Direct Recruitment',                  bp: 'adre-g4', target: 10, icon: '🏛️', search: 'adre grade 4 iv slrc hslc', desc: 'ADRE 2.0 Grade-IV (HSLC/Class X) — SLRC official pattern: 135 Q · 2.5 hrs · GK 30, SS 30, English 25, Maths 25, Reasoning 25.' },
    { id: 'adre-g3-driver', name: 'ADRE Grade III (Driver)', org: 'Assam Direct Recruitment',                bp: 'adre-g3-driver', target: 6, icon: '🚗', search: 'adre driver grade 3 iii', desc: 'ADRE 2.0 Grade-III Driver — SLRC pattern: 150 Q · 3 hrs incl. Road Transport 20 (pool pending).' },
    { id: 'adre-g4-viii',   name: 'ADRE Grade IV (Class VIII)', org: 'Assam Direct Recruitment',              bp: 'adre-g4-viii', target: 10, icon: '📗', search: 'adre grade 4 class 8 viii', desc: 'ADRE 2.0 Grade-IV (Class VIII/SCERT level) — SLRC official pattern: 135 Q · 2.5 hrs.' },
    { id: 'dhs',            name: 'DHS Assam',              org: 'Directorate of Health Services, Assam',     bp: 'dhs-assam-g3',   target: 10, icon: '🏥', search: 'dhs grade 3 non technical health services assam', desc: 'DHS Assam Grade-III (Non-Technical) — official pattern: 100 Q · 100 marks · 120 min · English, GK & Current Affairs, Reasoning, Computer.' },
  ];

  BT.find = function (sid) { return BT.SERIES.filter(function (s) { return s.id === sid; })[0] || null; };

  /* ═══════════════════ EXAM-SCOPED POOLS (hard subject isolation) ═══════════════════
     One pass over the REAL dedup'd bank; each question is classified into
     exactly ONE blueprint section (first matching section wins) → a
     question can never appear in two sections of the same exam, and can
     never enter a section whose subject it does not belong to. */
  BT._poolCache = {};
  function seriesPools(sid) {
    if (BT._poolCache[sid]) return BT._poolCache[sid];
    var s = BT.find(sid);
    var out = { sections: [], open: null, total: 0 };
    if (!s || !s.bp) { BT._poolCache[sid] = out; return out; }
    var bp = (BT.DB.blueprints && BT.DB.blueprints[sid] !== undefined)
      ? BT.DB.blueprints[sid] : BT.BLUEPRINTS[s.bp];
    if (!bp) { BT._poolCache[sid] = out; return out; } /* DB: unverified → no pool */
    var seen = {}, dedup = [];
    (window.STUDYRIA_QB || []).forEach(function (q) {
      var k = BT.qhash(q); /* §17: normalized full text + answer — punctuation variants dedupe too */
      if (!seen[k]) { seen[k] = 1; dedup.push(q); }
    });
    /* governance (§22) + approved practice pool (EXTRA — never unapproved) */
    dedup = dedup.filter(function (q) { return !governanceBlocks(q, sid); });
    /* approvals (site_config, zero-migration) OR registry rows gate EXTRA */
    if (window.STUDYRIA_QB_EXTRA && (BT.APPROVALS.loaded || BT.DB.ready)) {
      var ex = extraApproved(sid);
      ex.forEach(function (q) {
        var k = BT.qhash(q);
        if (!seen[k]) { seen[k] = 1; dedup.push(q); }
      });
    }
    if (bp.dist) {
      bp.dist.forEach(function (sec) { out.sections.push({ k: sec.k, n: sec.n, match: sec.match, qs: [] }); });
      dedup.forEach(function (q) {
        for (var i = 0; i < out.sections.length; i++) {
          try { if (out.sections[i].match(q)) { out.sections[i].qs.push(q); return; } } catch (e) {}
        }
      });
      out.sections.forEach(function (sec) { out.total += sec.qs.length; });
    } else {
      var pool = [];
      dedup.forEach(function (q) { try { if (bp.open(q)) pool.push(q); } catch (e) {} });
      out.open = pool; out.total = pool.length;
    }
    BT._poolCache[sid] = out;
    return out;
  }

  /* ── per-test size + published count — ALWAYS computed, never hardcoded ── */
  BT.info = function (sid) {
    var s = BT.find(sid); if (!s) return null;
    if (!s.bp) {
      return { s: s, poolCount: 0, perTest: 0, published: 0, mcqs: 0, pending: s.target,
        minPerTest: 0, durationMin: 0, needsVerification: true,
        subjects: [], status: 'needs_verification' };
    }
    var bp = (BT.DB.blueprints && BT.DB.blueprints[sid] !== undefined)
      ? BT.DB.blueprints[sid] : BT.BLUEPRINTS[s.bp];
    if (!bp) { /* DB: unverified — same honest needs_verification state */
      return { s: s, poolCount: 0, perTest: 0, published: 0, mcqs: 0, pending: s.target,
        minPerTest: 0, durationMin: 0, needsVerification: true, subjects: [], status: 'needs_verification' };
    }
    var p = seriesPools(sid);
    var published = s.target, cap = 0;
    if (bp.dist) {
      bp.dist.forEach(function (sec, i) {
        var pool = p.sections[i].qs.length;
        cap = i === 0 ? Math.floor(pool / sec.n) : Math.min(cap, Math.floor(pool / sec.n));
      });
      published = cap < 1 ? 0 : Math.min(s.target, cap);
    } else {
      cap = Math.floor((p.open || []).length / bp.total);
      published = cap < 1 ? 0 : Math.min(s.target, cap);
    }
    var subjects = (bp.dist || [{ k: 'General Studies (official subjects)', n: bp.total, qs: p.open || [] }]).map(function (sec, i) {
      var pool = bp.dist ? p.sections[i].qs.length : (p.open || []).length;
      return { name: sec.k, required: sec.n, pool: pool, tests: Math.floor(pool / sec.n) };
    });
    return {
      s: s, poolCount: p.total, perTest: bp.total, published: published,
      mcqs: published * bp.total, pending: Math.max(0, s.target - published),
      minPerTest: bp.durationMin, durationMin: bp.durationMin,
      durationConvention: !!bp.durationConvention, marks: bp.marks, neg: bp.neg,
      cycle: bp.cycle, source: bp.source,
      subjects: subjects,
      status: published >= s.target ? 'published' : (published > 0 ? 'partial' : 'pending')
    };
  };

  /* ── DISJOINT allocation (spec §7/§17): one seeded shuffle per series
     section; test n takes slice [(n-1)*n … n*n) → a question is never
     reused across tests of the same series while the pool allows. ── */
  BT._shuffled = {};
  function sectionShuffled(sid, k) {
    var key = sid + '::' + k;
    if (!BT._shuffled[key]) {
      var p = seriesPools(sid), sec = p.sections.filter(function (x) { return x.k === k; })[0];
      BT._shuffled[key] = seedShuffle(sec ? sec.qs : [], 'tsbp2:' + sid + ':' + k);
    }
    return BT._shuffled[key];
  }
  function openShuffled(sid) {
    if (!BT._shuffled[sid]) BT._shuffled[sid] = seedShuffle(seriesPools(sid).open || [], 'tsbp2:' + sid + ':open');
    return BT._shuffled[sid];
  }

  /* ── §12F/§15 HARD VALIDATION: exact section counts, subject membership,
     zero duplicates, exact total. Fail → the test does not exist. ── */
  function validateTest(sid, qs) {
    var s = BT.find(sid), bp = s && s.bp ? BT.BLUEPRINTS[s.bp] : null;
    if (!bp || !qs || qs.length !== bp.total) return false;
    if (bp.dist) {
      var counts = {}, seen = {};
      for (var i = 0; i < qs.length; i++) {
        var q = qs[i], key = BT.qhash(q);
        if (seen[key]) return false; /* duplicate question inside test */
        seen[key] = 1;
        var sec = bp.dist.filter(function (x) { try { return x.match(q); } catch (e) { return false; } })[0];
        if (!sec) return false; /* unrelated subject/question */
        counts[sec.k] = (counts[sec.k] || 0) + 1;
      }
      for (var j = 0; j < bp.dist.length; j++) if (counts[bp.dist[j].k] !== bp.dist[j].n) return false;
    } else {
      var seen2 = {};
      for (var m = 0; m < qs.length; m++) {
        var q2 = qs[m], key2 = BT.qhash(q2);
        if (seen2[key2]) return false;
        seen2[key2] = 1;
        var ok = false;
        try { ok = bp.open(q2); } catch (e) { ok = false; }
        if (!ok) return false;
      }
    }
    return true;
  }

  /* deterministic question set for series `sid`, test number `n` (1-based).
     Interleaves sections round-robin so the paper mixes subjects evenly. */
  BT.test = function (sid, n) {
    var i = BT.info(sid);
    if (!i || !i.s.bp || i.published < 1) return null;
    n = parseInt(n, 10) || 1;
    if (n < 1 || n > i.published) return null;
    var bp;
    if (BT.DB.blueprints && BT.DB.blueprints[sid] !== undefined) bp = BT.DB.blueprints[sid] || null;
    else bp = BT.BLUEPRINTS[i.s.bp];
    if (!bp) return null;
    var qs = [];
    if (bp.dist) {
      var blocks = bp.dist.map(function (sec) {
        var arr = sectionShuffled(sid, sec.k);
        return arr.slice((n - 1) * sec.n, n * sec.n);
      });
      if (blocks.some(function (b) { return b.length < 1; })) return null;
      var more = true;
      while (more) {
        more = false;
        for (var b = 0; b < blocks.length; b++) if (blocks[b].length) { qs.push(blocks[b].shift()); more = true; }
      }
    } else {
      var arr2 = openShuffled(sid);
      qs = arr2.slice((n - 1) * bp.total, n * bp.total);
    }
    if (qs.length !== bp.total) return null;
    if (!validateTest(sid, qs)) return null; /* §12F: invalid → not a test */
    BT.recordVersion(sid, n, qs);
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
      + '<div class="blt-hero-sub">Real exam-pattern test series — verified official blueprints only. Every test follows its exam\'s actual subjects, distribution and duration.</div>'
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

    /* series cards — verified blueprints with ≥1 publishable test only
       (needs_verification series are never shown in the app, spec §12C) */
    var rows = BT._visible();
    h += '<div class="blt-grid">';
    if (!rows.length) {
      h += '<div class="blt-empty">No test series match "' + esc(BT._q) + '". Try another exam — e.g. VFA, Police, APSC, SSC.</div>';
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
    { id: 'apsc', label: 'APSC', org: 'APSC' },
    { id: 'tet', label: 'TET', org: 'Assam TET Authority' },
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

  /* ── official exam-pattern block for the series page (spec §22) ── */
  function patternHTML(i) {
    var s = i.s, bp = BT.BLUEPRINTS[s.bp];
    if (!bp) return '';
    var h = '<div class="blt-pattern">'
      + '<div class="blt-pattern-title">📋 Exam Pattern — ' + esc(bp.cycle) + '</div>'
      + '<div class="blt-pattern-grid">';
    if (bp.dist) {
      bp.dist.forEach(function (sec) {
        h += '<div class="blt-pattern-row"><span class="blt-pattern-subj">' + esc(sec.k) + '</span><span class="blt-pattern-n">' + sec.n + ' Q</span></div>';
      });
    } else {
      h += '<div class="blt-pattern-row"><span class="blt-pattern-subj">General Studies — official subjects (History · Polity · Geography · Economy · Science &amp; Tech · Environment · Assam ~30–35%)</span><span class="blt-pattern-n">' + bp.total + ' Q</span></div>';
    }
    h += '</div>'
      + '<div class="blt-pattern-meta"><b>' + bp.total + ' Questions</b> · <b>' + bp.durationMin + ' Minutes</b> · <b>' + bp.marks + ' Marks</b>'
      + (bp.neg ? ' · Negative marking: <b>−' + bp.neg + '</b>' : '')
      + (i.durationConvention ? ' · <span class="blt-pattern-note">duration = practice convention (official duration not published)</span>' : '')
      + '</div>'
      + '<div class="blt-pattern-src">Pattern source: ' + esc(bp.source) + '</div>'
      + '</div>';
    return h;
  }

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
      + '<div class="blt-stat"><span class="blt-stat-n">' + i.durationMin + '</span><span class="blt-stat-l">Min/Test</span></div>'
      + '<div class="blt-stat"><span class="blt-stat-n blt-stat-lang">অসমীয়া | English</span><span class="blt-stat-l">Language</span></div>'
      + '</div></div>';

    h += patternHTML(i);

    h += '<div class="blt-choose">CHOOSE A TEST</div><div class="blt-tests">';
    for (var n = 1; n <= i.published; n++) {
      var resumable = null;
      try { if (TP().saved) resumable = TP().saved(sid, n); } catch (e) { resumable = null; }
      h += '<button class="blt-test' + (resumable ? ' has-resume' : '') + '" onclick="BrainLabTests.openTest(\'' + sid + '\',' + n + ')">'
        + '<span class="blt-test-no">' + n + '</span>'
        + '<span class="blt-test-main"><span class="blt-test-title">' + esc(s.name) + ' — Test ' + n + '</span>'
        + '<span class="blt-test-meta">' + i.durationMin + ' Minutes · ' + i.perTest + ' MCQs · ' + i.marks + ' Marks</span></span>'
        + (resumable ? '<span class="blt-test-resume">Resume</span>' : '<span class="blt-test-go">Start ›</span>')
        + '</button>';
    }
    if (i.pending > 0) {
      /* §19/§28 honest per-test status: never claim a test that does not
         pass validation. Tests beyond `published` are NOT real tests yet —
         they show exactly which verified content is missing, per subject,
         from real engine counts (no hardcoded numbers). */
      var bind = [];
      if (i.s.bp && BT.BLUEPRINTS[i.s.bp].dist) {
        BT.BLUEPRINTS[i.s.bp].dist.forEach(function (sec, ix) {
          var pool = i.subjects[ix] ? i.subjects[ix].pool : 0;
          var need = sec.n * s.target;
          if (pool < need) bind.push({ k: sec.k, pool: pool, need: need, more: need - pool });
        });
      }
      h += '<div class="blt-pending-note">';
      if (i.published >= 1) h += 'Test ' + (i.published + 1) + '–' + s.target + ': Preparing — verified questions being added';
      else h += 'Tests 1–' + s.target + ': Preparing — verified questions being added';
      if (bind.length) {
        h += '. Binding sections (verified pool / needed for all ' + s.target + ' tests): '
          + bind.map(function (b) { return esc(b.k) + ' ' + n2(b.pool) + '/' + n2(b.need) + ' — needs ' + n2(b.more) + ' more'; }).join(' · ') + '.';
      } else h += '.';
      h += '</div>';
    }
    h += '</div>';
    body.innerHTML = h;
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  /* ═══════════════════ TEST ATTEMPT (#brainlab/tests/<sid>/<n>) ═══════════════════
     Opens the DEDICATED full-screen attempt page — same engine + page
     system as exam mocks (BrainLabTestPage), activity_type='test'. The
     blueprint duration threads to the attempt timer via durationMin. */
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
      qs: t.qs,
      durationMin: i.durationMin
    });
  };

  /* public API for Admin (real data only — spec §27 pool-health report) */
  BT.adminReport = function () {
    return BT.SERIES.map(function (s) {
      var i = BT.info(s.id);
      if (i.needsVerification) {
        return { id: s.id, name: s.name, org: s.org, pool: 0, perTest: 0, published: 0,
          target: s.target, mcqs: 0, pending: s.target, subjects: [],
          status: 'Needs Verification', note: 'Blueprint verification required — official exam pattern not yet verified; series is not published.' };
      }
      return {
        id: s.id, name: s.name, org: s.org, pool: i.poolCount,
        perTest: i.perTest, published: i.published, target: s.target,
        mcqs: i.mcqs, pending: i.pending,
        durationMin: i.durationMin, durationConvention: i.durationConvention,
        marks: i.marks, neg: i.neg, cycle: i.cycle, source: i.source,
        subjects: i.subjects.map(function (x) {
          return { name: x.name, required: x.required, pool: x.pool,
            tests: Math.min(x.tests, i.published > 0 ? i.published : 0),
            unused: Math.max(0, x.pool - x.required * i.published) };
        }),
        status: i.published >= s.target ? 'Published' : (i.published > 0 ? 'Partially Published' : 'Content Pending'),
        note: i.published < s.target
          ? 'Section shortfall limits publication — see per-subject pool below.'
          : ''
      };
    });
  };

  /* ═══════════════════ V3 DB GOVERNANCE LAYER (supabase-driven) ═══════════════════
     Architecture: question CONTENT lives in the version-controlled bank
     files; the DATABASE owns governance — verified blueprints
     (bl_test_blueprints), per-question verification overrides
     (bl_question_registry), usage + test snapshots. DB rows OVERRIDE the
     JS fallback (spec §1: blueprint rules are database-driven). Fail-open:
     migration not run / fetch error → v2 JS behavior, unchanged.
     Registry: absent hash = 'legacy' bank question (kept); explicit
     'rejected' or 'needs_review' hash NEVER enters a public test. */
  BT.DB = { blueprints: null, registry: {}, ready: false, status: 'init' }; /* status: init → not_run | no_grants | ready */
  /* PRACTICE-SET APPROVALS (zero-migration path): stored in the EXISTING
     site_config table (key='brainlab_practice_approvals') — production
     RLS already gates writes to admin profiles. The owner approves each
     practice set subject in Admin → Test Engine; absent approval row =
     set stays locked (fail-closed, spec §22). The v3 migration and its
     bl_question_registry remain an OPTIONAL advanced layer — never a
     prerequisite for publishing approved practice tests. */
  BT.APPROVALS = { loaded: false, map: {} };

  /* deterministic question hash — normalized text + answer key.
     SAME normalization as the admin import tool (normQ) so hashes match
     across catalog, admin panel and QA scripts. */
  function normQ(t) { return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 120); }
  function djb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  BT.qhash = function (q) { return djb2(normQ(q[0]) + '|' + String(q[5] || '').toLowerCase()); };

  /* section-name → matcher registry (built from the verified JS blueprints'
     exact section keys, so a DB subject_dist maps 1:1 onto the verified
     subject scopes; unknown section names fall back to exact subject match) */
  var SECTION_MATCHERS = {};
  Object.keys(BT.BLUEPRINTS).forEach(function (k) {
    var bp = BT.BLUEPRINTS[k];
    (bp.dist || []).forEach(function (sec) { SECTION_MATCHERS[sec.k] = sec.match; });
  });

  /* apply a DB blueprint row over the JS one (verified DB rows win) */
  function applyDbBlueprint(sid, row) {
    var jsBp = BT.BLUEPRINTS[sid];
    if (!row) return jsBp;
    if (row.status !== 'verified') {
      /* DB says unverified → this exam is NOT publishable (JS fallback
         ignored; spec §12C: unverified pattern must never publish) */
      BT.BLUEPRINTS[sid] = null;
      return null;
    }
    var dist = [];
    try { dist = JSON.parse(row.subject_dist || '[]'); } catch (e) { dist = []; }
    var out = {
      cycle: row.exam_cycle || (jsBp && jsBp.cycle) || '',
      total: row.total_questions || (jsBp && jsBp.total) || 0,
      durationMin: row.duration_minutes || (jsBp && jsBp.durationMin) || 0,
      marks: row.total_marks != null ? Number(row.total_marks) : (jsBp && jsBp.marks),
      neg: row.negative_marking != null ? Number(row.negative_marking) : (jsBp && jsBp.neg) || 0,
      source: row.pattern_source || row.official_source || (jsBp && jsBp.source) || '',
      verifiedAt: row.verified_at || null
    };
    if (Array.isArray(dist) && dist.length) {
      out.dist = dist.map(function (d) {
        return {
          k: d.k, n: d.n,
          match: SECTION_MATCHERS[d.k] || (function (name) {
            return function (q) { return String(q[7]) === name || String(q[8]) === name; };
          })(d.k)
        };
      });
    } else {
      /* open pool (APSC-style) — keep the JS open matcher if it exists */
      out.open = (jsBp && jsBp.open) || function () { return false; };
    }
    return out;
  }

  /* fetch the governance layer (public reads; fail-open) */
  var dbInitTries = 0;
  BT.dbInit = function () {
    var sb = window.supabaseClient;
    if (!sb) { if (++dbInitTries < 15) setTimeout(BT.dbInit, 1200); return; } /* capped: fail-open to JS */
    var jobs = 3, done = 0;
    function fin() { if (done >= jobs) { BT.DB.ready = true; BT.resetPools(); var w = document.getElementById('blv8-tests'); if (w && w.classList.contains('on')) BT.renderCatalog(); } }
    sb.from('bl_test_blueprints').select('*').limit(50).then(function (r) {
      if (r && r.error) {
        var code = (r.error && (r.error.code || r.error.message)) || '';
        if (String(code).indexOf('42501') !== -1 || /permission/i.test(String(code))) BT.DB.status = 'no_grants';
        else BT.DB.status = 'not_run';
      } else if (BT.DB.status !== 'no_grants') { BT.DB.status = 'ready'; }
      if (!(r && r.error)) {
        BT.DB.blueprints = {};
        ((r && r.data) || []).forEach(function (row) {
          var bp = applyDbBlueprint(row.series_id, row);
          if (bp) BT.DB.blueprints[row.series_id] = bp;
          else BT.DB.blueprints[row.series_id] = null; /* DB says unverified */
        });
      }
      done++; fin();
    }).catch(function () { done++; fin(); });
    sb.from('bl_question_registry').select('qhash,series_id,subject,status,source,is_pyq,exam_year,paper_reference').limit(10000).then(function (r) {
      if (!(r && r.error)) {
        BT.DB.registry = {};
        ((r && r.data) || []).forEach(function (row) { BT.DB.registry[row.qhash] = row; });
      }
      done++; fin();
    }).catch(function () { done++; fin(); });
    /* practice approvals — site_config (existing table, no migration needed).
       ANON FALLBACK (2026-09-14): site_config has no public SELECT policy in
       production yet (one-time read-policy SQL not run), so anonymous
       students read zero rows and approvals would silently vanish for the
       exact audience they exist for. Until that SQL runs, approvals are ALSO
       mirrored in the version-controlled public file /brainlab-approvals.json
       (synced from site_config by the agent on owner approve/revoke). If
       site_config returns rows it still WINS; the mirror is only the
       fallback. Fail-closed either way: no approval anywhere = locked. */
    function approvalsFinish(map, src) {
      BT.APPROVALS.map = (map && typeof map === 'object') ? map : {};
      BT.APPROVALS.source = src || 'none';
      BT.APPROVALS.loaded = true;
      done++; fin();
    }
    function approvalsFromMirror() {
      try {
        fetch('/brainlab-approvals.json?v=' + Date.now(), { cache: 'no-store' })
          .then(function (fr) { return fr.ok ? fr.json() : null; })
          .then(function (j) {
            approvalsFinish((j && j.approvals) || {}, j ? 'mirror' : 'none');
          })
          .catch(function () { approvalsFinish({}, 'none'); });
      } catch (e) { approvalsFinish({}, 'none'); }
    }
    sb.from('site_config').select('key,value').eq('key', 'brainlab_practice_approvals').maybeSingle().then(function (r) {
      try {
        var row = r && r.data;
        if (row && row.value) {
          var parsed = (typeof row.value === 'string') ? JSON.parse(row.value) : row.value;
          var ap = (parsed && parsed.approvals) || parsed || {};
          if (ap && typeof ap === 'object' && Object.keys(ap).length) { approvalsFinish(ap, 'site_config'); return; }
        }
        approvalsFromMirror();
      } catch (e) { approvalsFromMirror(); }
    }).catch(function () { approvalsFromMirror(); });
  };

  /* governance filter — spec §22: only approved/legacy questions publish */
  function governanceBlocks(q, sid) {
    var reg = BT.DB.registry[BT.qhash(q)];
    if (!reg) return false;                       /* absent = legacy bank q */
    if (reg.status === 'rejected' || reg.status === 'needs_review') return true;
    /* exam-scoped registry row (series_id set) only governs that series */
    return false;
  }

  /* VFA practice pool (window.STUDYRIA_QB_EXTRA) — practice questions
     enter ONLY after the owner approves their hash in the registry */
  function extraApproved(sid) {
    var out = [], ex = window.STUDYRIA_QB_EXTRA || [];
    for (var i = 0; i < ex.length; i++) {
      var q = ex[i];
      var reg = BT.DB.registry[BT.qhash(q)];
      var regOk = !!(reg && reg.status === 'approved' && (!reg.series_id || reg.series_id === sid));
      var ap = BT.APPROVALS.map[String(q[7] || '')];
      var apOk = !!(ap && ap.approved_at && ap.series === sid);
      if (regOk || apOk) out.push(q);
    }
    return out;
  }

  /* record the exact question set of a generated test (spec §20/§28) —
     signed-in users only, fail-open, idempotent server-side */
  BT.recordVersion = function (sid, n, qs) {
    try {
      var sb = window.supabaseClient;
      if (!sb || !sb.auth || !qs || !qs.length) return;
      sb.auth.getSession().then(function (r) {
        if (!r || !r.data || !r.data.session) return; /* anon: skip telemetry */
        var hashes = qs.map(function (q) { return BT.qhash(q); });
        var bp = (BT.info(sid) || {}).s || null;
        sb.rpc('bl_test_version_record', { p_series: sid, p_test_n: n, p_version: 1,
          p_blueprint_hash: djb2(JSON.stringify(bp && (BT.BLUEPRINTS[bp.bp] || {}))), p_qhashes: hashes });
      }).catch(function () {});
    } catch (e) {}
  };

  /* pools may grow as imports warm — drop caches on demand (kept: same
     platform pattern as v1; euLive import warming preserved) */
  BT.resetPools = function () { BT._poolCache = {}; BT._shuffled = {}; };
  var impWarm = false;
  BT.boot = function () {
    if (impWarm) return;
    impWarm = true;
    try { BT.dbInit(); } catch (e) {}
    var u = window.BrainLabUniverse || {};
    if (u.fetchImported) {
      try {
        u.fetchImported(function () {
          BT.resetPools();
          var w = document.getElementById('blv8-tests');
          if (w && w.classList.contains('on')) BT.renderCatalog();
        });
      } catch (e) { }
    }
  };
  BT.boot();
})();
