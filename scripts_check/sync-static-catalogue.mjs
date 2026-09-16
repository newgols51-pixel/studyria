// ═══════════════════════════════════════════════════════════════════
// sync-static-catalogue.mjs — DB-truthful crawler snapshot generator
// (PERMANENT AUTO-SYNC EDITION, v168+)
// ═══════════════════════════════════════════════════════════════════
// WHY: AI chatbots (Gemini/Meta AI/Perplexity) and search crawlers fetch
// the raw HTML without executing the client-side Supabase query. The
// SPA therefore must carry its PUBLIC catalogue truth in the initial
// response. This script pulls the EXACT public dataset (anonymous
// Supabase REST query, status=published — the same query pdf-list.js
// runs) and bakes it into index.html:
//
//   1. The stat placeholders (libCount, libStatTotal, libStatCategories,
//      libStatDownloads, aboutStatPdfs) get the real DB numbers.
//   2. A JSON-LD ItemList (schema.org) exposes the real PDF titles,
//      categories, authors, prices and canonical detail URLs.
//   3. A <noscript> catalogue block lists the real titles so non-JS
//      readers see actual content, not an empty shell.
//
// AUTO-SYNC: .github/workflows/catalogue-sync.yml runs this script on a
// daily schedule (and on demand). If the catalogue content changed, it
// commits index.html + sw.js + catalogue-last-sync.json back to main;
// Cloudflare's git integration auto-deploys the push. Human visitors
// still get the live client-side Library query — this snapshot is ONLY
// the crawler-readable representation of the same DB truth.
//
// RUN:  node scripts_check/sync-static-catalogue.mjs
//
// EXIT CODES (used by CI + wrappers):
//   0 = catalogue changed  -> files written (index.html + sw.js bump + state)
//   2 = catalogue unchanged -> nothing written, nothing to deploy
//   1 = FAILURE            -> nothing written, last known-good catalogue preserved
//
// HONESTY GUARANTEE (failure safety): the script refuses to write zero
// counts — if the anonymous query fails or returns 0 rows it ABORTS and
// leaves index.html completely untouched (a broken fetch must never
// regress the page to "0 PDFs"). The previous good catalogue always
// survives a failed sync.
//
// ENV OVERRIDES (for CI + testing):
//   SUPABASE_URL      — override the project URL
//   SUPABASE_ANON_KEY — override the anon key (must remain the PUBLIC key)
// aboutStatStudents is NEVER touched — it is the owner's canonical
// "1,500+" social proof, not a DB metric, and must not auto-increase.

import { readFileSync, writeFileSync } from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qsdfmgcekdpjdcyqhuhi.supabase.co';
// Anon key only — the PUBLIC read key already shipped in the client
// bundle (supabase.js / index.html). NEVER put a service-role key here.
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZtZ2Nla2RwamRjeXFodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NTE2NDcsImV4cCI6MjA5NjIyNzY0N30.kDOEYxUQyLTp1blasuX2kVSIy2olGLhdqqtOMTlEX5g';

const FILE = 'index.html';
const SW_FILE = 'sw.js';
const STATE_FILE = 'scripts_check/catalogue-last-sync.json';
const BEGIN = '<!-- CATALOGUE-SNAPSHOT:BEGIN (auto-generated from the public Supabase query — run scripts_check/sync-static-catalogue.mjs after catalogue changes; do not hand-edit) -->';
const END = '<!-- CATALOGUE-SNAPSHOT:END -->';

const log = (...a) => console.log('[sync]', ...a);
const fail = (...a) => { console.error('[sync] ABORT:', ...a); process.exit(1); };

// ── 1. Fetch the EXACT public dataset (anonymous view, published only) ──
log('fetching published catalogue from', SUPABASE_URL);
const url = `${SUPABASE_URL}/rest/v1/pdfs?select=id,title,category,author,price,free,download_count,status,slug,created_at`
          + `&status=eq.published&order=created_at.desc`;

let res;
try {
  res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    signal: AbortSignal.timeout(20000),
  });
} catch (e) {
  fail(`network/timeout fetching Supabase (${e.message}) — index.html left untouched.`);
}
if (!res.ok) fail(`Supabase returned HTTP ${res.status} — index.html left untouched.`);

const rows = await res.json();
if (!Array.isArray(rows)) fail('unexpected Supabase payload (not an array) — index.html left untouched.', rows);

// ── 2. HONESTY GUARD: never bake a zero catalogue ──
if (rows.length === 0) {
  fail('anonymous query returned 0 published PDFs — refusing to write a "0 PDFs" snapshot. Investigate RLS/status filters instead.');
}

const total = rows.length;
const cats = [...new Set(rows.map(r => r.category).filter(Boolean))];
const downloads = rows.reduce((s, r) => s + (Number(r.download_count) || 0), 0);
const freeCount = rows.filter(r => r.free || Number(r.price) === 0).length;

log(`DB truth (anonymous view): ${total} published PDFs, ${cats.length} categories, ${downloads} downloads, ${freeCount} free`);

// ── 3. DATA INTEGRITY VALIDATION (before anything is written) ─────────
const ids = rows.map(r => r.id);
const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupIds.length) fail(`duplicate PDF ids in source rows: ${dupIds.join(', ')}`);
if (ids.some(id => !id)) fail('a source row has an empty id');
if (rows.some(r => !String(r.title ?? '').trim())) fail('a source row has an empty title');
if (!Number.isFinite(downloads) || downloads < 0) fail('download aggregate is not a non-negative number');
if (rows.some(r => r.price != null && !Number.isFinite(Number(r.price)))) fail('a source row has a non-numeric price');
if (cats.length === 0) fail('no categories derived from published rows');

// ── 4. Build the crawler-readable snapshot block ──
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const itemList = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  '@id': 'https://studyria.qzz.io/#catalogue',
  name: 'Studyria PDF Library — Published Catalogue',
  description: `Live catalogue snapshot: ${total} published PDFs across ${cats.length} categories (${downloads} total downloads). Auto-synced from the Studyria database.`,
  numberOfItems: total,
  itemListElement: rows.map((r, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Product',
      name: r.title,
      category: r.category || undefined,
      author: r.author ? { '@type': 'Person', name: r.author } : undefined,
      offers: {
        '@type': 'Offer',
        price: Number(r.price) || 0,
        priceCurrency: 'INR',
        availability: 'https://schema.org/InStock',
      },
      url: `https://studyria.qzz.io/#detail/${r.id}`,
    },
  })),
};

const catList = cats.map(c => {
  const n = rows.filter(r => r.category === c).length;
  return `<li><strong>${esc(c)}</strong> — ${n} PDF${n === 1 ? '' : 's'}</li>`;
}).join('');

const pdfList = rows.map((r, i) =>
  `<li>${i + 1}. <strong>${esc(r.title)}</strong>${r.category ? ` — ${esc(r.category)}` : ''}${r.free || Number(r.price) === 0 ? ' (Free)' : ` (₹${Number(r.price)})`}</li>`
).join('');

const block = `${BEGIN}
<script type="application/ld+json" id="catalogueSnapshotLd">
${JSON.stringify(itemList, null, 2)}
</script>
<noscript id="catalogueSnapshot">
  <section aria-label="Studyria PDF catalogue (text version for non-JavaScript readers and crawlers)" style="max-width:860px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif;">
    <h2>Studyria Library — ${total} PDFs</h2>
    <p>Live catalogue snapshot (auto-synced from the Studyria database): <strong>${total} published PDFs</strong>, <strong>${cats.length} categories</strong>, <strong>${downloads} downloads</strong> so far. Enable JavaScript for the interactive library.</p>
    <h3>Categories</h3>
    <ul>${catList}</ul>
    <h3>All PDFs (${total})</h3>
    <ol>${pdfList}</ol>
  </section>
</noscript>
${END}`;

// LEAK GUARD: the public block must never expose storage/signed URLs or keys.
if (/supabase\.co\/storage|service_role|SUPABASE_SERVICE|sign\?|token=/.test(block)) {
  fail('generated block contains a private URL/key pattern — refusing to write.');
}

// ── 5. Rewrite index.html in memory ──
let html = readFileSync(FILE, 'utf8');

const escRe = BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const endRe = END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
if (html.includes(BEGIN)) {
  html = html.replace(new RegExp(`${escRe}[\\s\\S]*?${endRe}`), block);
} else {
  const bodyRe = /(<body[^>]*>)/;
  if (!bodyRe.test(html)) fail('no <body> tag found.');
  html = html.replace(bodyRe, `$1\n\n${block}\n`);
}

const setStat = (id, val) => {
  const re = new RegExp(`(id="${id}"[^>]*>)[^<]*(</div>|</span>)`);
  if (!re.test(html)) { console.warn(`  WARN: #${id} not found`); return; }
  html = html.replace(re, `$1${val}$2`);
};
setStat('libCount', `${total} PDFs`);
setStat('libStatTotal', String(total));
setStat('libStatCategories', String(cats.length));
setStat('libStatDownloads', String(downloads));
setStat('aboutStatPdfs', String(total));

// ── 6. CHANGE DETECTION — commit/deploy only when content changed ──
const original = readFileSync(FILE, 'utf8');
if (html === original) {
  log('catalogue unchanged — nothing to write or deploy.');
  log(`last sync state kept as-is (see ${STATE_FILE}).`);
  process.exit(2);
}

// ── 7. Write files: snapshot + SW version bump + sync state ──
writeFileSync(FILE, html);
log('index.html regenerated with fresh DB truth.');

// SW cache bump — established deploy pattern for any HTML change.
let sw = readFileSync(SW_FILE, 'utf8');
const m = sw.match(/const CACHE_VERSION = 'v(\d+)'/);
if (!m) { console.warn('  WARN: CACHE_VERSION not found in sw.js — skipping bump'); }
else {
  const next = `v${Number(m[1]) + 1}`;
  sw = sw.replace(/const CACHE_VERSION = 'v\d+'/, `const CACHE_VERSION = '${next}'`);
  writeFileSync(SW_FILE, sw);
  log(`sw.js CACHE_VERSION bumped ${m[1]} -> ${next}`);
}

const state = {
  syncedAt: new Date().toISOString(),
  source: `${SUPABASE_URL}/rest/v1/pdfs (anonymous, status=published)`,
  pdfCount: total,
  categoryCount: cats.length,
  downloadAggregate: downloads,
  categories: cats,
  pdfIds: ids,
  changed: true,
};
writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');

log('SUMMARY — changed: true');
log(`  pdfs=${total} categories=${cats.length} downloads=${downloads} free=${freeCount}`);
log('  files: index.html, sw.js (version bump), scripts_check/catalogue-last-sync.json');
log('  next: commit + push → Cloudflare git integration auto-deploys.');
