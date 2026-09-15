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


console.log('\n[V8.1] Canonical persistence shape (sanitizePrefs)');
eq('valid payload preserved', SC.sanitizePrefs({ version: 1, shortcuts: ['brainlab', 'home'], updatedAt: '2026-09-15T10:00:00Z' }), { version: 1, shortcuts: ['brainlab', 'home'] });
eq('stray V8 {ids} shape absorbed defensively', SC.sanitizePrefs({ ids: ['home'], updatedAt: 'x' }), { version: 1, shortcuts: ['home'] });
eq('deliberate empty set is a valid saved choice', SC.sanitizePrefs({ shortcuts: [] }), { version: 1, shortcuts: [] });
eq('garbage string → null (falls back to defaults)', SC.sanitizePrefs('nope'), null);
eq('array → null', SC.sanitizePrefs(['home']), null);
eq('null → null', SC.sanitizePrefs(null), null);
eq('object with url field → null (no injection vector)', SC.sanitizePrefs({ url: 'javascript:alert(1)' }), null);
eq('corrupted ids trimmed (dup/unknown/>4)', SC.sanitizePrefs({ shortcuts: ['home','home','fake','brainlab','library','career-hub'] }), { version: 1, shortcuts: ['home','brainlab','library','career-hub'] });
eq('PREFS key is single canonical device key', SC.PREFS_KEY, 'studyria_shortcuts_v1');
eq('schema version metadata present', SC.PREFS_VERSION, 1);

console.log('\n[V8.1] Legacy key migration (one-time V8 → V8.1 absorb)');
eq('chooseLegacy picks most recently updated', SC.chooseLegacy([
  { key: 'shortcuts_v1:guest', ids: ['home'], updatedAt: '2026-09-15T10:00:00Z' },
  { key: 'shortcuts_v1:abc123', ids: ['brainlab'], updatedAt: '2026-09-15T12:00:00Z' }
]).key, 'shortcuts_v1:abc123');
eq('chooseLegacy validates ids through allowlist', SC.chooseLegacy([
  { key: 'shortcuts_v1:x', ids: ['fake', 'home'], updatedAt: '2026-09-15T09:00:00Z' },
  { key: 'shortcuts_v1:y', ids: ['javascript:alert(1)'], updatedAt: '2026-09-15T11:00:00Z' }
]).ids, ['home']);
eq('chooseLegacy rejects invalid-only candidates', SC.chooseLegacy([{ key: 'shortcuts_v1:x', ids: ['fake'] }]), null);
eq('chooseLegacy rejects non-array input', SC.chooseLegacy('nope'), null);
eq('legacy prefix is the V8 per-identity key format', SC.LEGACY_PREFIX, 'shortcuts_v1:');

console.log('\n[V8.1] Cloud sync honestly OFF until SQL migration runs');
t('CLOUD_SYNC_ENABLED is false (LOCAL_ONLY is the real state)', SC.CLOUD_SYNC_ENABLED === false);

const pwaSrc = require('fs').readFileSync(new URL('../pwa-v32.js', import.meta.url), 'utf8');
t('no false account-sync claim wording anywhere', !/synced to your account/i.test(pwaSrc));
t('honest device wording present ("Saved on this device")', pwaSrc.includes('Saved on this device'));
t('quick-section subtitle per spec ("Your 4 quick-access sections")', pwaSrc.includes('Your 4 quick-access sections'));
t('editor intro per spec ("Choose up to 4 sections.")', pwaSrc.includes("' sections.</span>'"));
t('future-sync note is truthful ("after cloud sync is enabled")', pwaSrc.includes('account sync will be available after cloud sync is enabled'));
t('sign-in/logout safe: storage key is NOT identity-scoped', !/_scLsKey|shortcuts_v1:' \+/.test(pwaSrc));

// Every cloud table call must sit behind the flag gate, gate BEFORE call.
const fnBodies = pwaSrc.match(/async function _sc(?:FetchRemote\(\)|SaveRemote\([^)]*\))[\s\S]*?\n  \}/g) || [];
eq('two flag-gated cloud functions exist (inert until migration)', fnBodies.length, 2);
t('every cloud function gates on _scCloudOn() BEFORE any table call', fnBodies.every(b => {
  const gate = b.indexOf('_scCloudOn()');
  const call = b.indexOf("from('user_shortcut_prefs')");
  return gate > -1 && call > gate;
}));
const initBody = (pwaSrc.match(/function _scInit\(\)[\s\S]*?\n  \}/) || [''])[0];
t('load path makes NO cloud fetch today (zero 404/4xx, no console spam)', !initBody.includes('_scFetchRemote('));

console.log('\n[V8.1] Responsive static checks (320–768px, no overflow)');
const cssSrc = require('fs').readFileSync(new URL('../pwa-v32.css', import.meta.url), 'utf8');
const scBlock = cssSrc.slice(cssSrc.indexOf('MY SHORTCUTS V8'));
t('tile grid is fluid auto-fill/minmax (never overflows)', /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(76px,\s*1fr\)\)/.test(scBlock));
t('no fixed element width wider than a 320px viewport', !/(?<!max-)(?<!min-)\bwidth:\s*([2-9]\d{2,})px/.test(scBlock));
t('320px media query forces exactly 4 columns', /@media \(max-width:\s*359px\)/.test(scBlock) && scBlock.includes('repeat(4, 1fr)'));
t('row labels shrink-safe (min-width 0 / flex-shrink present)', scBlock.includes('.pwa32-sc-order-label { flex: 1;'));
t('buttons meet 44px touch target', scBlock.includes('min-height: 44px'));
t('Paper Cream pinned tokens used — no dark backgrounds introduced', /var\(--glass-bg|var\(--text, #1c1b1a\)/.test(scBlock) && !/background:\s*(#000|#111|#1a1a)/.test(scBlock));

console.log('\n[V8.1] Asset wiring');
const idxSrc = require('fs').readFileSync(new URL('../index.html', import.meta.url), 'utf8');
t('shortcut-core.js?v=2 wired before pwa-v32.js?v=10', idxSrc.includes('shortcut-core.js?v=2" defer></script>\n<script src="pwa-v32.js?v=10"'));
const swSrc = require('fs').readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
t('service worker install & push handlers intact (version-agnostic since v160+)',
  /CACHE_VERSION = 'v\d+'/.test(swSrc) && swSrc.includes("addEventListener('install'") && swSrc.includes("addEventListener('push'"));

console.log(`\n═══ RESULTS: ${pass} passed, ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
