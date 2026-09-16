#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════
   REGRESSION TEST — P0/P1: honest data states + zero fabricated metrics
   Change set: 15 Sep 2026 (homepage discovery engine, Career Spotlight,
   Career Hub, BrainLab affairs, global search, PDP marketing mode,
   seeded ratings, marketing page)

   Guards five contracts:
     1. LOADING → DATA | ERROR(+Retry) | GENUINE EMPTY everywhere — a
        failed fetch may NEVER render as "0 results"/skeletons forever.
     2. The homepage Career Spotlight is actually wired (CSS + real-jobs
        loader) — it previously shipped with NO CSS and NO populator.
     3. No fabricated metrics: no seeded 4.5–5.0 ratings, no fake
        review/sales counts, no PDP marketing mode, no fake base additions.
     4. Global search waits for the client and surfaces a PDF-pipeline
        failure instead of masking it as "no results".
     5. Untouched systems remain intact (Razorpay, install prompt, SW,
        ownership system).
   ══════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const idx  = fs.readFileSync(path.join(ROOT, 'index.html'),   'utf8');
const home = fs.readFileSync(path.join(ROOT, 'homepage.html'),'utf8');
const plj  = fs.readFileSync(path.join(ROOT, 'pdf-list.js'), 'utf8');
const chj  = fs.readFileSync(path.join(ROOT, 'career-hub.js'),'utf8');
const chj2 = fs.readFileSync(path.join(ROOT, 'career-hub-v2.js'),'utf8'); // ← the one index.html actually loads
const sv2j = fs.readFileSync(path.join(ROOT, 'studyria-home-v2.js'),'utf8');
const blj  = fs.readFileSync(path.join(ROOT, 'brainlab.js'), 'utf8');
const v7j  = fs.readFileSync(path.join(ROOT, 'brainlab-v7.js'),'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else      { fail++; console.log('  ✗ FAIL: ' + name); }
}
function section(t) { console.log('\n── ' + t + ' ──'); }

/* ══════════ 1. HOMEPAGE DISCOVERY — HONEST STATES ══════════ */
section('1. Homepage discovery honest state machine');

ok(idx.includes("id=\"shDiscoveryErrorHost\""),
   'error host element exists in markup');
ok(idx.includes("if (window._libFetchFailed)") && idx.includes("Couldn\\'t load study materials"),
   'failed pipeline renders honest error (not silent return)');
ok(idx.includes('window.pdfListReload ? window.pdfListReload() : location.reload()'),
   'Retry button re-runs the real pipeline');
ok(idx.includes('HONEST BOOT') && idx.includes('_shBootTries < 60'),
   'boot poll is bounded — no more infinite 600ms loop');
ok(idx.includes("studyria:pdfs-ready"),
   'pdf-list success broadcasts the ready event');
ok(plj.includes('window.pdfListReload = pdfListMain'),
   'pdf-list exposes a manual reload hook');
ok(plj.includes('window._libFetchFailed = false; // reset at the start'),
   'reload resets the failure flag first');

ok(idx.includes("Couldn\\'t load popular downloads"),
   'Popular Downloads: fetch failure = ERROR state');
ok(idx.includes('Popular downloads will appear here once PDFs are published.'),
   'Popular Downloads: genuine empty state is honest (no "No data yet.")');
ok(!idx.includes("padding:30px;color:var(--text2)\">No data yet.</div>"),
   'old ambiguous "No data yet." removed');

/* ══════════ 2. CAREER SPOTLIGHT — REALLY WIRED ══════════ */
section('2. Career Spotlight (homepage) wired + honest');

ok(idx.includes('.cs-section { position:relative; padding:64px'),
   'Career Spotlight now has real CSS (was: none at all)');
ok(idx.includes('CAREER SPOTLIGHT LOADER') && idx.includes("window._csSpotlightLoad"),
   'Career Spotlight now has a JS loader (was: hardcoded skeletons forever)');
ok(idx.includes(".eq('active', true)") && idx.includes(".limit(8)"),
   'spotlight queries REAL active jobs from the jobs table');
ok(idx.includes("Couldn\\'t load job openings") && idx.includes('window._csSpotlightLoad()">↻ Retry</button>'),
   'spotlight fetch failure = ERROR + Retry');
ok(idx.includes('No open listings right now'),
   'spotlight genuine zero = honest empty state');
ok(idx.includes('data-job-id=') && idx.includes("ev.target.closest('.cs-card')"),
   'card clicks use data-attributes + delegation (no nested-quote inline JS)');
ok(idx.includes(".select('id,title,organization,location,job_type,published_at,created_at')"),
   'spotlight query selects only real jobs columns (org removed)');
ok(!idx.includes("org.ilike.%'+query+'%"),
   'search .or() filter no longer references the nonexistent jobs.org column');
ok(idx.includes("select('id, title, organization, location, job_type, published_at')"),
   'search jobs query selects only real jobs columns');

/* ══════════ 3. CAREER HUB / BRAINLAB — ERROR ≠ EMPTY ══════════ */
section('3. Career Hub + BrainLab error states');

ok(chj.includes('P0 fix (Sep 2026)') && chj.includes('Date.now() - started < 8000'),
   'chLoadJobs waits for the client instead of instant "Supabase not available"');
ok(blj.includes('_renderAffairsError') && blj.includes("Couldn\\'t load current affairs"),
   'BrainLab affairs: fetch error shows ERROR with Retry');
ok(!blj.includes('.catch(function(){s._renderAffairs(c,[]);})'),
   'BrainLab affairs: error no longer renders the "no affairs" empty state');
ok(v7j.includes("Couldn\\'t load current affairs — check your connection"),
   'V7 affairs quiz: error toasts the real cause (not "not enough affairs")');

/* ══════════ 4. GLOBAL SEARCH — NO SILENT SKIPS ══════════ */
section('4. Global search honest sources');

ok(idx.includes('function _gsWaitClient'),
   'search waits for the Supabase client (jobs/affairs no longer silently skipped)');
ok(idx.includes('var sb = await _gsWaitClient()') &&
   idx.includes('var sb2 = await _gsWaitClient()'),
   'both jobs and affairs queries await the client');
ok(idx.includes('if (!hasAny && window._libFetchFailed)'),
   'PDF-pipeline failure never masquerades as "no results"');
ok(idx.includes("PDF matches aren\\'t shown"),
   'partial-failure notice explains exactly what is missing');

/* ══════════ 5. FABRICATION REMOVED ══════════ */
section('5. Fabricated metrics removed (P1)');

ok(!idx.includes('= shSeededRating(') && !idx.includes('function shSeededRating'),
   'homepage cards: no more seeded 4.5–5.0 rating (row hidden until real)');
ok(idx.includes('hasRealRating') && idx.includes("ratingHTML = hasRealRating"),
   'card rating renders only from real review stats');
ok(!idx.includes('window._ottSeededRating(p.id).toFixed(1)'),
   'library cards: seeded rating fallback removed');
ok(idx.includes('const ratingVal = p.rating ? parseFloat(p.rating).toFixed(1) : \'\';'),
   'library card rating comes only from the DB');
ok(!idx.includes('const isMarketing'),
   'PDP marketing mode branch removed');
ok(!idx.includes('_pdpMarketingData(pdfId)') && !idx.includes('function _pdpMarketingData'),
   'PDP fake-data generator deleted');
ok(!idx.includes('mkt.baseDownloads'),
   'no fake download base is added to real counts');
ok(!idx.includes('cached.sales = 1000 +') && !idx.includes('cached.reviews = 80 +'),
   'enrichPdf no longer fabricates sales/review counts');
ok(idx.includes('REAL DB VALUES ONLY (Sep 2026 P1 fix)'),
   'enrichPdf passes through DB values only');
ok(!idx.includes('.pdp-rev-sample-badge {') && !idx.includes("class=\"pdp-rev-sample-badge\""),
   'fake "Sample Review" cards removed from the PDP');
ok(idx.includes('No reviews yet — be the first to share your experience.'),
   'zero reviews → honest empty + real review form');
ok(!idx.includes('1.2K+ Students Learning'),
   'YouTube social proof normalized to canonical "1,500+"');
ok(idx.includes('id="srvAvgNum" style="display:none"'),
   'Success-stories static 4.9 avg hidden by default (was fabricated)');
ok(idx.includes('var realOnly=list.filter(function(x){return x.verified;});'),
   'success-stories numeric avg computed from VERIFIED reviews only');
ok(idx.includes('avgEl.style.display = \'none\'') || idx.includes("avgEl.style.display='none'"),
   'sample-only wall shows no numeric rating');

/* ══════════ 6. MARKETING PAGE TRUTHFULNESS ══════════ */
section('6. homepage.html truthful');

ok(!/<span class="stat-label">Selectees/.test(home),
   'fabricated selectee-count tile removed');
ok(!home.includes('860 sold') && !home.includes('1,120 sold') &&
   !home.includes('2,340 downloads') && !home.includes('640 sold'),
   'fabricated sold/download counts removed from product cards');
ok(!/Average Rating<\/span>/.test(home),
   'fabricated "4.9★ Average Rating" stat removed (DB has 0 reviews)');
ok(home.includes('>28<') || home.includes('>28</span>'),
   'exam-category count is the real DB number (28)');
ok(home.includes('Sample stories shown for illustration'),
   'testimonials clearly labelled as sample content');
ok(!home.includes('Selected</div>'),
   'no "Selected" claims in sample testimonials');
ok(home.includes('Featured this week'),
   'unsubstantiated "Best sellers this week" renamed');
ok(home.includes('Secure Razorpay Checkout') && home.includes('Built for Assam Exams'),
   'replacement tiles are factual, non-metric');

/* ══════════ 7. UNTOUCHED SYSTEMS INTACT ══════════ */
section('7. Regression protection');

ok(idx.includes('beforeinstallprompt') && idx.includes('deferredPrompt'),
   'PWA install flow intact');
ok(idx.includes('razorpay') || idx.includes('Razorpay'),
   'Razorpay payment flow intact');
ok(idx.includes('SRP') && idx.includes('srPdfAccess'),
   'server-side purchase verification intact');
ok(idx.includes("_loadOwnershipCache") && idx.includes("purchased_pdfs"),
   'ownership system intact');
ok(blj.includes("startPYQ") && (blj.includes("renderMCQs") || v7j.includes("renderMCQs")),
   'BrainLab PYQ/MCQ engines untouched');
ok(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('CACHE_VERSION'),
   'service worker present (cache-bump handled separately)');
ok(idx.includes("SELECT REAL ONES") === false && idx.includes('pdf_reviews').toString() === 'true' || idx.includes('pdf_reviews'),
   'PDP still reads real reviews from pdf_reviews');

/* ── 8. Zero-count categories never say "0 PDFs" (Sep 2026 owner report) ── */
const sv2 = fs.readFileSync(path.join(ROOT, 'studyria-home-v2.js'), 'utf8');
ok(!sv2.includes("+ c.count + ' PDFs</div>'"),
   'popular-categories card no longer prints the raw count as "N PDFs"');
ok(sv2.includes("c.count > 0 ? c.count + ' PDFs' : 'Coming Soon'"),
   'zero-count categories show "Coming Soon" instead of "0 PDFs"');
ok(fs.readFileSync(path.join(ROOT, 'studyria-home-v2.css'), 'utf8').includes('sv2-cat-count-soon'),
   'Coming Soon label styled (muted)');

/* ── 9. Homepage job sections actually populate (16 Sep owner report) ── */
ok(chj2.includes('_t0<8000'),
   'career-hub-v2 chLoadJobs waits for the Supabase client (no instant error)');
ok(chj2.includes("CustomEvent('studyria:jobs-ready')"),
   'career-hub-v2 dispatches studyria:jobs-ready after jobs load');
ok(sv2j.includes('typeof chLoadJobs === \'function\'') && sv2j.includes('if (!getJobs().length)'),
   'sv2 homepage kicks a background jobs load when _ch.jobs is empty');
ok(chj2.includes("jobType:(r.job_type||'').toLowerCase()"),
   'career-hub-v2 _map exposes lowercased jobType (Govt/Private homepage filters work)');
ok(chj2.includes("p<1||p>200000"),
   'career-hub-v2 posts parse has sanity cap (no date-concat garbage like 2026152026142026)');

/* ══════════ RESULTS ════════════════ */
console.log(`\n═══ RESULTS: ${pass} passed, ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
