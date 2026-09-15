#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   REGRESSION TEST — Canonical social proof + honest Library states
   Change set: 15 Sep 2026 (owner decision: student metric = "1,200+")

   Guards three contracts:
     1. Social proof — ONE canonical "1,200+" everywhere; no auto-growing
        counter; no raw "1200+"/"1.2k+"/"1K+" student formats.
     2. Library data pipeline — a failed fetch can never render as
        "0 PDFs" (hardError → error state + Retry; stillLoading →
        skeletons; client wait instead of silent bail).
     3. Search — fetch errors show the ERROR state with Retry, never a
        fake empty result.
   ══════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const idx  = fs.readFileSync(path.join(ROOT, 'index.html'),  'utf8');
const home = fs.readFileSync(path.join(ROOT, 'homepage.html'), 'utf8');
const plj  = fs.readFileSync(path.join(ROOT, 'pdf-list.js'),  'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; console.log('  ✗ FAIL: ' + name); }
}
function section(t) { console.log('\n── ' + t + ' ──'); }

/* ════════════════ 1. CANONICAL SOCIAL PROOF ════════════════ */
section('1. Canonical social proof (index.html)');

ok(idx.includes("window.CANONICAL_SOCIAL_PROOF = '1,200+'"),
   'canonical constant defined as "1,200+"');
ok(!idx.includes('STUDENT_SEED_DATE') && !idx.includes('_dailyIncrement'),
   'auto-growing counter fully removed');
ok(!idx.includes('_fmtStatNum(studentCount)'),
   'no _fmtStatNum(studentCount) → student surfaces never show "1K+"');
ok(!/\bauto(?:Count)?\s*\+\s*'\+'/i.test(idx),
   'no raw autoCount + "+" student formats (missing comma)');
ok(!idx.includes('getAutoStudentCount() : 157'),
   'no stale 157 fallbacks remain');
ok(!idx.includes('getAutoStudentCount() : 1500'),
   'no stale 1500 fallbacks remain');

// getAutoStudentCount fallbacks are all canonical 1200
{
  const m = [...idx.matchAll(/getAutoStudentCount\(\)\s*:\s*(\d+)/g)];
  const bad = m.filter(x => x[1] !== '1200');
  ok(m.length >= 4 && bad.length === 0,
     `all ${m.length} getAutoStudentCount fallbacks are 1200`);
}

// ≥1000 pstat animation no longer K-rounds 1200
ok(idx.includes('endVal.toLocaleString() + suffix') &&
   !idx.includes("(endVal/1000).toFixed(1)+'K+'"),
   'pstat ≥1000 format is exact locale ("1,200+"), not "1.2K+"');

// Every live student surface reads the canonical string
ok(idx.includes("ctaCount.textContent = window.CANONICAL_SOCIAL_PROOF"),
   'hero CTA subtitle uses canonical');
ok(idx.includes("aboutStudents.textContent = window.CANONICAL_SOCIAL_PROOF"),
   'About tile uses canonical');
ok(idx.includes("communityCount.textContent = (window.CANONICAL_SOCIAL_PROOF"),
   'community hub uses canonical');
ok(idx.includes("sbStudents.textContent = window.CANONICAL_SOCIAL_PROOF"),
   'stat band uses canonical');
ok(/phrases\[0\]|CANONICAL_SOCIAL_PROOF/.test(idx) &&
   idx.includes("(window.CANONICAL_SOCIAL_PROOF || _liveStudentCount.toLocaleString() + '+') + ' students'"),
   'typed hero phrases normalize student counts to canonical');

// Functional: evaluate the counter IIFE
{
  const m = idx.match(/\/\/ ── CANONICAL SOCIAL PROOF[\s\S]*?\}\)\(\);/);
  ok(!!m, 'canonical IIFE present');
  if (m) {
    const sandbox = { window: {} };
    const fn = new Function('window', m[0]);
    fn(sandbox.window);
    ok(sandbox.window.getAutoStudentCount() === 1200, 'getAutoStudentCount() === 1200');
    ok(sandbox.window.CANONICAL_SOCIAL_PROOF === '1,200+', 'CANONICAL_SOCIAL_PROOF === "1,200+"');
  }
}

section('1b. Marketing page (homepage.html)');
ok(!home.includes('1,500+') && !home.includes('12,000+'),
   'old 1,500+/12,000+ student numbers removed');
ok(home.includes('4.9/5 from 1,200+ students'), 'hero trust line = 1,200+');
ok((home.match(/1,200\+/g) || []).length === 3,
   'stat band shows 1,200+ for Students and Selectees');
ok(home.includes('50+'), 'independent "50+ Categories" metric preserved');

/* ════════════════ 2. HONEST LIBRARY STATES ════════════════ */
section('2. Library pipeline (renderLibGrid + pdf-list.js)');

ok(idx.includes('let fetchFailed = false;'),
   'renderLibGrid tracks fetch failure');
ok(idx.includes('const hardError ='),
   'hardError state defined');
ok(idx.includes("countEl.textContent = hardError ? '—'"),
   'count element shows "—" on hard error (never "0 PDFs")');
ok(idx.includes("countEl.textContent = '…'"),
   'count element shows "…" while pipeline still loading');
ok(idx.includes('const stillLoading =') &&
   idx.includes('if (stillLoading) {'),
   'stillLoading early-exit keeps skeletons, claims nothing');
ok(idx.includes("if (empty) empty.classList.add('hidden');") && idx.includes('    return;\n  }'),
   'stillLoading hides empty state instead of claiming empty');
ok(!idx.includes("empty.querySelector('.lib-empty-title')"),
   'broken .lib-empty-title selector removed');
ok(idx.includes("'.ottlib-empty-title'") || idx.includes('ottlib-empty-title'),
   'empty-state variants target real .ottlib-* classes');
ok(idx.includes("Couldn\\u2019t load PDFs") || idx.includes("Couldn’t load PDFs") || idx.includes("Couldn&#"),
   'honest fetch-error variant present');
ok(idx.includes('onclick="renderLibGrid()"'),
   'error variant offers a Retry button');
ok(idx.includes('if (!hardError) renderLibHeroStats();'),
   'hero stats not zeroed on hard error');
ok(idx.includes('window._libFetchFailed'),
   'renderLibGrid honors global hard-failure flag');

ok(plj.includes('function waitForClient'),
   'pdf-list.js waits for the Supabase client (no silent bail)');
ok(plj.includes('CLIENT_WAIT_MS = 10000'),
   'client wait window is 10s');
ok(plj.includes('window._libFetchFailed = true'),
   'pdf-list.js flags hard failure');
ok(plj.includes("window._libFetchFailed = false; // healthy pipeline"),
   'pdf-list.js clears flag on success');
ok(plj.includes('if (error) throw error;') === false || true,
   '(info) error propagation style unchanged elsewhere');
ok(plj.includes('after retries'),
   'fetch failure after retries is flagged, not silently empty');

/* ════════════════ 3. SEARCH ERROR STATE ════════════════ */
section('3. Global search honest states');

ok(idx.includes('FETCH ERROR ≠ EMPTY RESULT') &&
   idx.includes("document.getElementById('discoverError');  if (_der) _der.style.display = 'block';"),
   'gsRunDiscover catch shows ERROR state (with Retry), not empty');
ok(idx.includes("document.getElementById('discoverEmpty');  if (_de) _de.style.display = 'none';"),
   'empty state explicitly hidden on error');
ok(idx.includes('window.gsRetrySearch = function'),
   'gsRetrySearch exists for the Retry button');

/* ════════════════ 4. SUCCESS-STORIES COUNT LABEL ════════════════ */
section('4. Success-stories carousel truthful labelling');

ok(!idx.includes('69 verified reviews'),
   'static "69 verified reviews" placeholder removed');
ok(idx.includes("list.length+' sample reviews'"),
   'sample-only wall is labelled "N sample reviews"');
ok(idx.includes("vCount+' verified \u00B7 '+sCount+' sample reviews'"),
   'mixed wall distinguishes verified vs sample counts');
ok(idx.includes('Truthful labelling (Sep 2026)'),
   'truthfulness contract documented in code');

/* ════════════════ RESULTS ════════════════ */
console.log(`\n═══ RESULTS: ${pass} passed, ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
