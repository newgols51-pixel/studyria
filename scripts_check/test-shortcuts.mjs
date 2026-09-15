// ═══════════════════════════════════════════════════════════════════
// STUDYRIA — My Shortcuts V8 — logic tests (task §20 items 1–13)
// Pure functions only (shortcut-core.js) — UI/responsive items are
// verified separately. Run: node scripts_check/test-shortcuts.mjs
// ═══════════════════════════════════════════════════════════════════
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const SC = require('../shortcut-core.js');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; console.log('  ✗ FAIL: ' + name); }
}
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  t(name + (ok ? '' : ` — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`), ok);
}

console.log('\n[1] Default shortcuts');
eq('defaults are exactly 4', SC.DEFAULT_IDS.length, 4);
eq('defaults all valid', SC.validate(SC.DEFAULT_IDS), SC.DEFAULT_IDS);
eq('defaults order = BrainLab, Mock Tests, Free Materials, Current Affairs',
  SC.DEFAULT_IDS, ['brainlab', 'brainlab-mocks', 'free-materials', 'brainlab-affairs']);

console.log('\n[2-4] Selection limits');
eq('select 1 keeps order', SC.validate(['brainlab']), ['brainlab']);
eq('select 4 keeps exact order',
  SC.validate(['brainlab-mocks', 'brainlab', 'my-library', 'career-hub']),
  ['brainlab-mocks', 'brainlab', 'my-library', 'career-hub']);
eq('5th shortcut blocked at max 4',
  SC.validate(['home', 'brainlab', 'brainlab-mocks', 'my-library', 'career-hub']),
  ['home', 'brainlab', 'brainlab-mocks', 'my-library']);

console.log('\n[5] Reorder is order-preserving (validate never sorts)');
eq('order preserved, not sorted', SC.validate(['wishlist', 'home']), ['wishlist', 'home']);

console.log('\n[10-11] Reset / invalid IDs rejected');
t('DEFAULT_IDS immutable (tamper-proof)', (() => {
  try { SC.DEFAULT_IDS.push('tamper'); return false; }
  catch(e) { return Object.isFrozen(SC.DEFAULT_IDS) && SC.DEFAULT_IDS.length === 4; }
})());
eq('unknown ID rejected', SC.validate(['brainlab', 'fake-route']), ['brainlab']);
eq('javascript: URL rejected', SC.validate(['javascript:alert(1)']), []);
eq('data: URI rejected', SC.validate(['data:text/html,x']), []);
eq('blob: URI rejected', SC.validate(['blob:https://x']), []);
eq('file: URI rejected', SC.validate(['file:///etc']), []);
eq('vbscript: rejected', SC.validate(['vbscript:msg']), []);
eq('prototype-pollution id rejected', SC.validate(['__proto__']), []);
eq('non-string elements rejected', SC.validate(['home', 42, null, {}]), ['home']);
eq('non-array input rejected', SC.validate('brainlab'), []);
eq('duplicate IDs de-duplicated', SC.validate(['home', 'home']), ['home']);
eq('mixed valid/invalid', SC.validate(['home', 'nope', 'brainlab', 7, 'my-library']), ['home', 'brainlab', 'my-library']);

console.log('\n[12] All allowlist routes verified against production');
const PAGES = ['home','library','dashboard','wishlist','detail','career-hub','creator-register',
  'creator-dashboard','upload','privacy','terms','refund','about','contact','blog','premium',
  'premium-library','my-library','pwa','customize','campus','brainlab','free-materials','ai-notes','notifications','pdf-checkout'];
const BL_TABS = { quiz:1, flashcards:1, mock:1, mistakes:1, affairs:1, leaderboard:1, performance:1 };
let allRoutesReal = true;
for (const [id, def] of Object.entries(SC.ALLOWLIST)) {
  if (!PAGES.includes(def.nav.page)) { console.log('  ✗ bad page for ' + id); allRoutesReal = false; }
  if (def.nav.blTab && !BL_TABS[def.nav.blTab]) { console.log('  ✗ bad blTab for ' + id); allRoutesReal = false; }
  if (def.nav.blScroll && def.nav.blScroll !== 'bl-sec-pyq') { console.log('  ✗ bad blScroll for ' + id); allRoutesReal = false; }
  if (def.nav.meTab) { console.log('  ✗ unexpected meTab for ' + id); allRoutesReal = false; }
  if (!def.label || !def.icon || !def.desc) { console.log('  ✗ missing meta for ' + id); allRoutesReal = false; }
}
t('every allowlist entry targets a real production route (' + Object.keys(SC.ALLOWLIST).length + ' entries)', allRoutesReal);

console.log('\n[SQL sync] server allowlist matches client allowlist');
const sql = require('fs').readFileSync(new URL('../sql/user-shortcuts-migration.sql', import.meta.url), 'utf8');
const m = sql.match(/el\.id NOT IN \(([^)]+)\)/);
const sqlIds = m ? m[1].match(/'([a-z-]+)'/g).map(s => s.slice(1, -1)).sort() : [];
eq('SQL allowlist === client allowlist', sqlIds, Object.keys(SC.ALLOWLIST).sort());
t('SQL enforces max 4 server-side', /user_shortcut_prefs_max4/.test(sql) && /<= 4/.test(sql));
t('SQL enables RLS', /ENABLE ROW LEVEL SECURITY/.test(sql));
t('SQL has no DELETE policy (upsert-only)', !/FOR DELETE/.test(sql));

console.log(`\n═══ RESULTS: ${pass} passed, ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
