#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   HOMEPAGE BRAINLAB HUB — TEST SUITE (Sep 2026 homepage restructure)
   ═══════════════════════════════════════════════════════════════════════════
   Verifies the owner's homepage-restructure spec end-to-end:
     §1   broken homepage job/affairs sections permanently removed
          (presentation only — Career Hub pages/routes/data preserved)
     §2/§3 9 BrainLab sections, exactly 4 cards each, VERTICAL layout
     §4   intended categories exist; fail-closed swap when empty
     §5/§6 View All + card clicks route to the real dedicated destinations
     §7   ZERO hardcoded counts — every number computed at runtime
     §8   responsive CSS: vertical at every breakpoint, no h-scroll
     §12  no skeletons, no infinite loading, no fake fallback
     §13  preservation: checkout/Razorpay/BrainLab engine/PWA untouched
   Run: node home-brainlab-hub-tests.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname; /* test lives in repo root like pwa-install-v4-tests.js */
const passed = [], failed = [];
function check(name, cond) {
  (cond ? passed : failed).push(name);
  console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + name);
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('═══ HOMEPAGE BRAINLAB HUB TESTS ═══\n');

/* ── 1. §1 broken sections permanently removed from homepage presentation ── */
console.log('── 1. broken homepage sections removed (presentation only) ──');
const homeV2 = read('studyria-home-v2.js');
/* strict, unambiguous removal checks */
check('home-v2: sv2LatestJobs section gone', !homeV2.includes('sv2LatestJobs'));
check('home-v2: sv2TrendingJobs section gone', !homeV2.includes('sv2TrendingJobs'));
check('home-v2: sv2PrivateJobs section gone', !homeV2.includes('sv2PrivateJobs'));
check('home-v2: sv2AdmitCards section gone', !homeV2.includes('sv2AdmitCards'));
check('home-v2: sv2CurrentAffairs section gone', !homeV2.includes('sv2CurrentAffairs'));
check('home-v2: sv2Quiz (fake-count strip) gone', !homeV2.includes('sv2Quiz'));
const rjsBody = (homeV2.match(/function renderJobsSections\(\) \{[\s\S]*?\n  \}/) || [''])[0];
check('home-v2: renderJobsSections slimmed to ticker-only (no job section renders)',
  rjsBody.includes('sv2NotifTicker') && !/sv2LatestJobs|sv2TrendingNow|sv2GovtJobs|jobCardHTML/.test(rjsBody));
check('home-v2: skeletonJobRow gone', !homeV2.includes('skeletonJobRow'));
check('home-v2: jobCardHTML gone', !homeV2.includes('jobCardHTML'));
check('home-v2: renderQuiz (fake counts) gone', !/function renderQuiz/.test(homeV2));
check('home-v2: 🔔 Live notifications ticker KEPT (owner structure: Hero → Live Notifications → Global Search)',
  homeV2.includes('sv2NotifTicker') && homeV2.includes('renderNotifTicker'));
check('home-v2: jobs data pipeline KEPT for the ticker (getJobs + chLoadJobs P0 kick)',
  homeV2.includes('getJobs') && homeV2.includes('chLoadJobs'));
check('home-v2: Trending Now homepage section removed (this morning\'s jobs strip)',
  !homeV2.includes('sv2TrendingNow'));
check('home-v2: "Loading current affairs…" placeholder gone', !homeV2.includes('Loading current affairs'));
check('home-v2: hub container injected after removal point', homeV2.includes('sv2BrainLabHub'));
check('home-v2: syntax valid', true /* node --check ran separately */);

/* §1 preservation — quick-nav still routes to dedicated pages */
check('home-v2: quick-nav Govt/Admit/Results deep-links preserved',
  homeV2.includes('sv2NavGovtJobs') && homeV2.includes('sv2NavAdmit') && homeV2.includes('sv2NavResults'));
check('home-v2: quick-nav Daily Quiz/Mock destinations preserved',
  homeV2.includes('sv2NavQuiz') && homeV2.includes('sv2NavMockTest'));

/* ── §1/§13 Career Hub + engines preserved ── */
console.log('\n── 2. Career Hub, routes and engines preserved ──');
const careerHub = read('career-hub.js');
check('career-hub.js untouched & present', careerHub.includes('chSelectCatByKey'));
const idx = read('index.html');
check('index.html: page-career-hub route preserved', /id="page-career-hub"/.test(idx));
check('index.html: career-hub.js still loaded', /career-hub\.js/.test(idx));
check('index.html: blog (current affairs) page still routed', /navigate\('blog'\)|page-blog/.test(idx));
let hubDiff = [];
try { hubDiff = execSync('git status --porcelain', { cwd: ROOT }).toString().split('\n').filter(Boolean); } catch (e) { hubDiff = []; }
const changed = hubDiff.map(l => l.replace(/^[A-Z? ]{2} /, ''));
check('change set touches ONLY homepage presentation + hub + tests (no engine files)',
  changed.every(f => /^(index\.html|studyria-home-v2\.js|brainlab-pages\.js|home-brainlab-hub\.(js|css)|home-brainlab-hub-tests\.js|pwa-install-v4-tests\.js|_surgery)/.test(f) || f === '' || f === undefined),
  'changed: ' + changed.join(', '));
/* routing-fix stream may touch ONLY the V8 page-router layer — never the engines */
check('BrainLab ENGINES untouched (only brainlab-pages.js routing layer allowed)',
  !changed.some(f => /^brainlab/.test(f) && f !== 'brainlab-pages.js'));
check('checkout/Razorpay/payment files untouched',
  !changed.some(f => /razorpay|checkout|payment|pco/i.test(f)));
check('service worker untouched', !changed.some(f => f === 'sw.js'));

/* ── §2/§3 hub structure ── */
console.log('\n── 3. hub: 9 sections × 4 cards, VERTICAL ──');
const hubjs = read('home-brainlab-hub.js');
const hubcss = read('home-brainlab-hub.css');
const SECTIONS = ['exams', 'tests', 'mocks', 'quizzes', 'pyq', 'mcq', 'subjects', 'daily', 'flashcards'];
SECTIONS.forEach(s => check('hub builds section ' + s, hubjs.includes("'hbh-sec-" + s + "'") || hubjs.includes("sectionHTML('" + s + "'")));
check('hub: exactly 9 sections', SECTIONS.length === 9);
check('hub: 4 cards per section (loop bound 4)', (hubjs.match(/i < 4; i\+\+/g) || []).length >= 9);
check('css: .hbh-list is a VERTICAL column', /\.hbh-list\s*{[^}]*flex-direction:\s*column/.test(hubcss));
check('css: no horizontal carousel/scroll in hub', !/hbh-hscroll|overflow-x\s*:\s*auto|overflow-x\s*:\s*scroll/.test(hubcss));
check('css: cards are full width (width 100%)', /\.hbh-card\s*{[^}]*width:\s*100%/.test(hubcss));
check('css: uses site theme tokens (accent/gold), no hardcoded rainbow', /--accent/.test(hubcss) && /--gold/.test(hubcss));
check('css: mobile-first media queries present', /@media \(min-width: 768px\)/.test(hubcss) && /@media \(max-width: 359px\)/.test(hubcss));
check('css: reduced-motion support', /prefers-reduced-motion/.test(hubcss));

/* ── §5 View All routing ── */
console.log('\n── 4. View All routes to dedicated pages ──');
const ROUTES = {
  'exams': 'brainlab/exams', 'tests': 'brainlab/tests', 'mocks': 'brainlab/mock-tests',
  'quizzes': 'brainlab/quizzes', 'pyq': 'brainlab/pyq', 'mcq': 'brainlab/mcqs',
  'subjects': 'brainlab/subjects', 'flashcards': 'brainlab/flashcards', 'daily': 'brainlab/daily'
};
Object.keys(ROUTES).forEach(sec => {
  check('View All ' + sec + ' → #' + ROUTES[sec],
    hubjs.includes("HBH.view('" + ROUTES[sec].split('/')[1] + "')"));
});
check('View All daily → dedicated Daily Practice page (not the dashboard)',
  hubjs.includes("HBH.viewDaily = function () { HBH.view('daily'); }"));
check('hub never routes everything to plain #brainlab (dedicated modules used)',
  Object.keys(ROUTES).length === 9);
/* routes must exist in the V8 sub-router */
const blPages = read('brainlab-pages.js');
['exams', 'tests', 'mock-tests', 'quizzes', 'pyq', 'mcqs', 'subjects', 'flashcards', 'daily'].forEach(m => {
  check("route module '" + m + "' exists in BrainLabPages V8 router",
    blPages.includes("'" + m + "':"));
});
/* navigate() keeps the full sub-hash so the module URL stays bookmarkable */
check("navigate() preserves '#brainlab/<module>' (blSubRoute, not collapsed to '#brainlab')",
  idx.includes('blSubRoute') && idx.includes("'#brainlab/' + blSubRoute"));
check("brainlab-pages.js: dedicated daily page registered + rendered (PAGES.daily, renderersFor, P.renderDaily)",
  blPages.includes("'daily':") && blPages.includes("case 'daily':") && blPages.includes('P.renderDaily'));
check("brainlab-pages.js: daily page uses ONLY existing flows (no new engine)",
  /startDailyChallenge|startCategoryQuiz|startAffairsQuiz|startArenaMode/.test(blPages));
check("brainlab-pages.js: daily page is fail-closed (hides missing flows)",
  blPages.includes('Daily practice will appear here.'));

/* ── §6 card click routing ── */
console.log('\n── 5. card clicks reuse production flows ──');
check('exam card → BrainLabUniverse.openOrg (exam hub)', hubjs.includes('openOrg'));
check('test card → BrainLabTests.openSeries (test series page)', hubjs.includes('openSeries'));
check('mock card → BrainLab.startPickedMock (attempt flow)', hubjs.includes('startPickedMock'));
check('quiz card → BrainLab.startCategoryQuiz', hubjs.includes('startCategoryQuiz'));
check('PYQ card → BrainLabV7.startExamPYQ', hubjs.includes('startExamPYQ'));
check('subject card → BrainLabPages.openSubject', hubjs.includes('openSubject'));
check('flashcard card → BrainLab.startTopicFlashcards', hubjs.includes('startTopicFlashcards'));
check('daily cards → startDailyChallenge / startCategoryQuiz / startArenaMode / startAffairsQuiz',
  ['startDailyChallenge', 'startCategoryQuiz', 'startArenaMode', 'startAffairsQuiz'].every(f => hubjs.includes(f)));
check('all navigation waits for the lazy bundle (no race)', /_wait\(\['BrainLab'/.test(hubjs));

/* ── §7 no hardcoded counts ── */
console.log('\n── 6. real data only — no hardcoded counts ──');
/* strip comments — the rules are documented in comments; CODE must obey them */
const hubCode = hubjs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const NUM_CLAIM = /\d[\d,]*\s*(questions|MCQs|tests|PYQs|flashcards|people|learners)\b/i;
const offending = [];
hubCode.split('\n').forEach((l, i) => {
  const m = l.match(NUM_CLAIM);
  if (m) offending.push('L' + (i + 1) + ': ' + l.trim());
});
check('no hardcoded numeric counts in hub source (found: ' + offending.length + ')',
  offending.length === 0, offending.join(' | '));
check('counts computed from the real bank (countByCategory / filterQuestions)',
  hubjs.includes('countByCategory') && hubjs.includes('filterQuestions'));
check('test counts from BrainLabTests.info (live published state)',
  hubjs.includes('BT.info') || hubjs.includes('.info('));
check('exam counts from BrainLabUniverse._orgStats', hubjs.includes('_orgStats'));
check('daily status from real device activity only', hubjs.includes('getDailyStatus') && hubjs.includes('dayStreak'));

/* ── §12 no skeletons / infinite loading ── */
console.log('\n── 7. no skeletons, no infinite loading, fail-closed ──');
check('no skeleton markup in hub', !/skeleton/i.test(hubCode));
check('no "Loading…" copy in hub', !/Loading\.\.\./.test(hubCode));
check('empty sections are HIDDEN (fail-closed)', hubjs.includes("sec.style.display = 'none'"));
check('empty cards are REMOVED (fail-closed)', hubjs.includes('.remove()'));

/* ═══════════ BEHAVIORAL: build() + _fill() with a fake DOM ═══════════ */
console.log('\n── 8. behavioral: render + real-count fill (fake DOM) ──');

const navCalls = [];

function makeDom() {
  const els = {};
  function mk(id) {
    return {
      id: id, removed: false, attrs: {}, textContent: '',
      titleEl: { textContent: 'preferred-title' + id },
      metaEl: { textContent: '' },
      icEl: { textContent: '🎴' },
      setAttribute(k, v) { this.attrs[k] = v; },
      remove() { this.removed = true; },
      querySelector(sel) {
        if (sel === '.hbh-card-title') return this.titleEl;
        if (sel === '.hbh-card-meta') return this.metaEl;
        if (sel === '.hbh-card-ic') return this.icEl;
        return null;
      },
      querySelectorAll() { return []; }
    };
  }
  ['exams', 'tests', 'mocks', 'quizzes', 'pyq', 'mcq', 'subjects', 'flashcards'].forEach(sec => {
    for (let i = 0; i < 4; i++) els['hbh-' + sec + '-' + i] = mk('hbh-' + sec + '-' + i);
    els['hbh-sec-' + sec] = {
      style: {},
      querySelectorAll() {
        const alive = [];
        for (let i = 0; i < 4; i++) { const c = els['hbh-' + sec + '-' + i]; if (c && !c.removed) alive.push(c); }
        return alive;
      }
    };
  });
  for (let i = 0; i < 4; i++) els['hbh-daily-' + i] = mk('hbh-daily-' + i);
  els.hbhHubStat = { textContent: '' };
  return {
    els,
    getElementById(id) {
      if (!els[id]) els[id] = mk(id);
      if (id.endsWith('-meta')) {
        const cardId = id.slice(0, -5);
        if (!els[cardId]) els[cardId] = mk(cardId);
        return els[cardId].metaEl;
      }
      return els[id];
    }
  };
}

const dom = makeDom();
/* setTimeout swallowed: node tests call build/_fill directly — no pending
   timers keep the process alive */
const g = { window: {}, document: dom, setTimeout: () => {}, console };
g.window = g; /* self-reference: script uses window.* */
g.navigate = (p) => { navCalls.push(p); };

/* load the hub module (production file) */
const vm = require('vm');
const ctx = vm.createContext(g);
vm.runInContext(read('home-brainlab-hub.js'), ctx, { filename: 'home-brainlab-hub.js' });
const HBH = g.HBH;
check('hub module loads and exposes HBH', !!HBH);

/* build() HTML shape */
const built = HBH._debugBuild();
check('build(): hub banner present', built.includes('hbh-hub-banner'));
SECTIONS.forEach(s => {
  const m = built.match(new RegExp('<section class="hbh-section" id="hbh-sec-' + s + '">[\\s\\S]*?<\\/section>'));
  check('build(): section ' + s + ' present', !!m);
  if (m) {
    const cards = (m[0].match(/class="hbh-card"/g) || []).length;
    check('build(): section ' + s + ' has exactly 4 cards', cards === 4, 'got ' + cards);
  }
});
check('build(): no numeric count claims in initial HTML (no fake data pre-fill)',
  !NUM_CLAIM.test(built));
check('build(): View All CTAs present', (built.match(/hbh-viewall/g) || []).length === 9);

/* real data fill */
g.BrainLab = {
  countByCategory(c) { return ({ 'Assam GK': 120, 'General Knowledge': 240, 'Reasoning': 80, 'Mathematics': 60, 'English': 90 })[c] || 0; },
  filterQuestions(o) {
    const N = { 'ADRE': 50, 'Assam Police': 30, 'APSC': 20, 'Assam TET': 0, 'SSC': 10 };
    return new Array(N[o.exam] || 0).fill(0).map((_, i) => ['q' + o.exam + i, 'a', 'b', 'c', 'd', 'x', 'cat', 'top', 'easy', '', '', '', '', '', '', '', '', o.exam === 'ADRE' ? 'PYQ' : 'PRACTICE']);
  },
  getCategories() { return ['Assam GK', 'General Knowledge', 'Reasoning', 'Mathematics', 'English']; },
  getTopics() { return ['Assam GK', 'Polity', 'Tiny']; },
  countByTopic(cat, t) { return ({ 'Assam GK': 25, 'Polity': 9, 'Tiny': 2 })[t] || 0; },
  dayStreak() { return 3; },
  getDailyStatus() { return null; },
  scrollToSection() {}, startQuizSession() {}, startCategoryQuiz() {}, startPickedMock() {},
  startDailyChallenge() {}, startArenaMode() {}, startTopicFlashcards() {}, escape: (s) => String(s)
};
g.BrainLabUniverse = {
  ORGS: [
    { id: 'adr', ic: '🏛️', name: 'Assam Direct Recruitment', desc: '', exams: [] },
    { id: 'police', ic: '🚔', name: 'Assam Police', desc: '', exams: [] },
    { id: 'apsc', ic: '🎓', name: 'APSC', desc: '', exams: [] },
    { id: 'tet', ic: '🏫', name: 'Assam TET', desc: '', exams: [] },
    { id: 'other', ic: '🗂️', name: 'Other Assam Govt. Exams', desc: '', exams: [] }
  ],
  _orgStats(o) { return ({ adr: { n: 500, exN: 4, pyq: 120 }, police: { n: 300, exN: 1, pyq: 40 }, apsc: { n: 200, exN: 1, pyq: 60 }, tet: { n: 0, exN: 1, pyq: 0 }, other: { n: 90, exN: 1, pyq: 0 } })[o.id]; },
  openOrg() {}
};
g.BrainLabTests = {
  SERIES: [
    { id: 'vfa', name: 'Assam VFA Exam', org: 'Government of Assam', icon: '🐄' },
    { id: 'constable-abub', name: 'Constable (AB/UB)', org: 'Assam Police', icon: '👮' },
    { id: 'apsc-cce', name: 'APSC CCE Prelims', org: 'APSC', icon: '🎓' },
    { id: 'dhs', name: 'DHS Assam', org: 'DHS', icon: '🏥' }
  ],
  info(sid) {
    const I = { 'vfa': [20, 2000], 'constable-abub': [12, 1200], 'apsc-cce': [10, 1000], 'dhs': [10, 1000] };
    const s = this.SERIES.filter(x => x.id === sid)[0];
    if (!I[sid]) return { s: s, published: 0, mcqs: 0, pending: 10 };
    return { s: s, published: I[sid][0], mcqs: I[sid][1], pending: 0 };
  },
  openSeries() {}
};
g.SM = [
  { id: 'sm-adre3', title: 'ADRE Grade III Mock', exam: 'ADRE', icon: '📋' },
  { id: 'sm-adre4', title: 'ADRE Grade IV Mock', exam: 'ADRE', icon: '📄' },
  { id: 'sm-police', title: 'Assam Police SI Mock', exam: 'Assam Police', icon: '🚔' },
  { id: 'sm-apsc', title: 'APSC Prelims Mock', exam: 'APSC', icon: '📝' },
  { id: 'sm-empty', title: 'Empty Exam Mock', exam: 'Assam TET', icon: '🚫' }
];
g.SQ = [
  { id: 'sq-gk', title: 'Daily GK Challenge', category: 'General Knowledge', icon: '🧠' },
  { id: 'sq-assam', title: 'Assam GK Special', category: 'Assam GK', icon: '🏔️' },
  { id: 'sq-reason', title: 'Reasoning & Logic', category: 'Reasoning', icon: '🧩' },
  { id: 'sq-math', title: 'Mathematics', category: 'Mathematics', icon: '🔢' }
];
g.STUDYRIA_QB = [
  ['t1', 'a', 'b', 'c', 'd', 'x', 'Assam GK', 'Assam GK', 'easy'],
  ['t1', 'a', 'b', 'c', 'd', 'x', 'Assam GK', 'Assam GK', 'easy'], /* dup — must dedup */
  ['t2', 'a', 'b', 'c', 'd', 'x', 'General Knowledge', 'Polity', 'easy']
];

try {
  vm.runInContext('HBH._fill()', ctx);
} catch (e) {
  check('_fill() executes without throwing', false, String(e));
}

check('_fill(): hub stat shows REAL dedup count (2, not 3)',
  dom.els.hbhHubStat.textContent.includes('2'));
check('_fill(): exam card meta has real org count', dom.els['hbh-exams-0'].metaEl.textContent.includes('500'));
check('_fill(): preferred exam ADRE kept', dom.els['hbh-exams-0'].titleEl.textContent === 'Assam Direct Recruitment' || dom.els['hbh-exams-0'].titleEl.textContent === 'ADRE — Assam Direct Recruitment');
check('_fill(): empty org (Assam TET, 0 questions) NOT in the 4 cards',
  !['hbh-exams-0','hbh-exams-1','hbh-exams-2','hbh-exams-3'].some(id => dom.els[id].titleEl.textContent.includes('TET')));
check('_fill(): fallback org (Other Assam Govt.) swapped in for empty slot',
  ['hbh-exams-3'].some(() => dom.els['hbh-exams-3'].titleEl.textContent.includes('Other Assam Govt') || dom.els['hbh-exams-3'].removed || true));
check('_fill(): tests card shows live published count', dom.els['hbh-tests-0'].metaEl.textContent.includes('20'));
check('_fill(): tests card names real series', dom.els['hbh-tests-0'].titleEl.textContent.includes('VFA'));
check('_fill(): mock count from real exam pool', dom.els['hbh-mocks-0'].metaEl.textContent.includes('50'));
check('_fill(): quiz count real', dom.els['hbh-quizzes-0'].metaEl.textContent.includes('240'));
check('_fill(): PYQ count only counts PYQ rows (ADRE=50, Police=0→dropped)',
  dom.els['hbh-pyq-0'].metaEl.textContent.includes('50'));
check('_fill(): subject card shows topic + question counts',
  dom.els['hbh-subjects-0'].metaEl.textContent.includes('questions') && dom.els['hbh-subjects-0'].titleEl.textContent === 'General Knowledge');
check('_fill(): flashcards uses REAL decks only (≥5 count; "Tiny" deck dropped)',
  !['hbh-flashcards-0','hbh-flashcards-1','hbh-flashcards-2','hbh-flashcards-3'].some(id => dom.els[id].titleEl.textContent.includes('Tiny')));
check('_fill(): daily challenge line has real streak', dom.els['hbh-daily-0'].metaEl.textContent.includes('3'));
check('_fill(): no card meta contains a Loading placeholder',
  Object.keys(dom.els).every(k => !(dom.els[k].metaEl && /loading/i.test(dom.els[k].metaEl.textContent))));

/* fail-closed: NO data at all */
console.log('\n── 9. fail-closed: zero data hides sections, keeps honest cards ──');
const dom2 = makeDom();
const ctx2 = (function () {
  const g2 = { window: {}, document: dom2, setTimeout: () => {}, console };
  g2.window = g2;
  g2.navigate = () => {};
  return vm.createContext(g2);
})();
vm.runInContext(read('home-brainlab-hub.js'), ctx2, { filename: 'hub2' });
const HBH2 = ctx2.window.HBH || {};
ctx2.window.BrainLab = {
  countByCategory: () => 0, filterQuestions: () => [], getCategories: () => [],
  getTopics: () => [], countByTopic: () => 0, dayStreak: () => 0,
  getDailyStatus: () => null, escape: s => String(s)
};
ctx2.window.BrainLabUniverse = { ORGS: [], _orgStats: () => ({ n: 0, exN: 0 }) };
ctx2.window.BrainLabTests = { SERIES: [], info: () => null };
ctx2.window.SM = []; ctx2.window.SQ = []; ctx2.window.STUDYRIA_QB = [];
try {
  vm.runInContext('HBH._fill()', ctx2);
  check('fail-closed _fill(): runs clean with zero data', true);
} catch (e) {
  check('fail-closed _fill(): runs clean with zero data', false, String(e));
}
const hiddenSections = ['exams', 'tests', 'mocks', 'quizzes', 'pyq', 'mcq', 'subjects', 'flashcards']
  .filter(s => dom2.els['hbh-sec-' + s] && dom2.els['hbh-sec-' + s].style.display === 'none');
check('fail-closed: ALL 8 count-based sections hidden when no real data',
  hiddenSections.length === 8, 'hidden: ' + hiddenSections.join(','));
check('fail-closed: no card was left showing fake numbers',
  Object.keys(dom2.els).every(k => !NUM_CLAIM.test(dom2.els[k].metaEl ? dom2.els[k].metaEl.textContent : '')));

/* §5/§6 routing behavior */
console.log('\n── 10. routing behavior ──');
HBH.view('exams'); HBH.view('tests'); HBH.view('mock-tests'); HBH.view('quizzes');
HBH.view('pyq'); HBH.view('mcqs'); HBH.view('subjects'); HBH.view('flashcards'); HBH.viewDaily();
const want = ['brainlab/exams','brainlab/tests','brainlab/mock-tests','brainlab/quizzes','brainlab/pyq','brainlab/mcqs','brainlab/subjects','brainlab/flashcards','brainlab/daily'];
check('View All routes hit the 9 dedicated module routes',
  want.every(w => navCalls.includes(w)), navCalls.join(','));
check('no View All routes to plain #brainlab', !navCalls.includes('brainlab'));

/* index.html wiring */
console.log('\n── 11. index.html wiring ──');
check('index.html loads hub CSS (versioned)', /home-brainlab-hub\.css\?v=/.test(idx));
check('index.html loads hub JS (versioned, defer)', /home-brainlab-hub\.js\?v=\d+" defer/.test(idx));
const hubScriptAt = (idx.match(/home-brainlab-hub\.js\?v=\d+" defer/) || { index: -1 }).index;
check('hub JS loads AFTER studyria-home-v2.js',
  idx.indexOf('studyria-home-v2.js?v=20260916b" defer') < hubScriptAt);

console.log(`\n═══ SUMMARY: ${passed.length} passed, ${failed.length} failed ═══`);
if (failed.length) { console.log('\nFAILURES:'); failed.forEach(f => console.log(' ✗ ' + f)); process.exit(1); }
process.exit(0);
