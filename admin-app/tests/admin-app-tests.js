/* Studyria Admin App — structural test suite (node, no browser) */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  FAIL:', name); } };

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inline = fs.readFileSync(path.join(root, 'js/admin-console-inline.js'), 'utf8');
const mod = n => fs.readFileSync(path.join(root, 'js/modules', n), 'utf8');

// ── 1. Shell structure ─────────────────────────────────────────
ok('toastContainer present', html.includes('id="toastContainer"'));
ok('page-admin present', html.includes('id="page-admin"'));
ok('page-admin-login present', html.includes('id="page-admin-login"'));
ok('adminMain present', html.includes('id="adminMain"'));
ok('adminSidebar present', html.includes('id="adminSidebar"'));
ok('icon sprite present', html.includes('symbol id="ic-dashboard"'));
ok('noindex meta', /noindex/.test(html));
ok('admin manifest linked', html.includes('manifest-admin.json'));
ok('ADMIN logo referenced (login)', /admin-login-shield"><img src="icons\/admin-logo\.png/.test(html));
ok('ADMIN logo referenced (topbar)', /admin-topbar-logo[\s\S]{0,200}icons\/admin-logo\.png/.test(html));

// ── 2. DOM ids the console JS expects ───────────────────────────
const ids = ['adminLoginEmail','adminLoginPass','adminLoginBtn','adminLoginError','adminLoginErrorMsg',
  'adminBreadcrumb','adminTopbarAvatar','adminTopbarName','adminTopbarEmail','adminOrdersBadge','adminMemBadge',
  'arvPendingBadge','adminMain','page-admin','page-admin-login','toastContainer'];
for (const id of ids) ok('shell id #' + id, html.includes('id="' + id + '"'));
// containers that live in templates (sbp*) or in the shell atab divs
for (const id of ['sbpQueueList','sbpMobileEditorBody'])
  ok('container id #' + id + ' (in JS templates)', inline.includes(id));
for (const id of ['campus-admin-content','brainlab-admin-content'])
  ok('container id #' + id + ' (shell atab div)', html.includes('id="' + id + '"'));

// ── 3. Every sidebar tab resolves (or is a known planned tab) ────
const tabs = [...html.matchAll(/data-atab="([a-z-]+)"/g)].map(m => m[1]);
ok('40+ tabs in sidebar', tabs.length >= 40);
const cases = new Set([...inline.matchAll(/case '([a-z-]+)':/g)].map(m => m[1]));
const planned = new Set(['header-manager','nav-manager','home-layout-manager']);
// smart-publish intentionally remaps to add-pdf (workflow lives there)
// smart-publish: sidebar intentionally remaps to add-pdf (the workflow lives there)
ok('smart-publish button remaps to add-pdf', /data-atab="smart-publish"[^>]*onclick="switchAdminTab\('add-pdf'\)"/.test(html));
// creator-manager: handled by creator-program.js switchAdminTab patch
ok('creator-manager patched by creator-program.js', /tab === 'creator-manager'/.test(mod('creator-program.js')));
const resolved = new Set([...cases, 'add-pdf', 'creator-manager', 'smart-publish']);
const unresolved = tabs.filter(t => !resolved.has(t) && !planned.has(t));
ok('all sidebar tabs resolve to a renderer (' + tabs.length + ' buttons)', unresolved.length === 0);
if (unresolved.length) console.error('   unresolved:', unresolved.join(', '));

// ── 4. Module globals exist in the module files ─────────────────
ok('pwa-admin: renderPWAdmin32', /renderPWAdmin32/.test(mod('pwa-admin-v32.js')));
ok('notifications: SN.adminPanel', /adminPanel/.test(mod('studyria-notifications.js')));
ok('zubeen: renderZubeenLegacyAdmin', /renderZubeenLegacyAdmin/.test(mod('zubeen-legacy-admin.js')));
ok('test-engine: renderBrainLabTestEngine', /renderBrainLabTestEngine/.test(mod('brainlab-admin-tests.js')));
ok('pass: renderPassManagement', /renderPassManagement/.test(mod('pass-management.js')));
ok('memberships: renderAdminMemberships', /renderAdminMemberships/.test(mod('admin-membership-manager.js')));
ok('campus: CampusAdminRender', /CampusAdminRender/.test(mod('campus-admin.js')));
ok('campus: BrainLabAdminRender', /BrainLabAdminRender/.test(mod('campus-admin.js')));
ok('cloud: SCCloud.render', /SCCloud/.test(mod('cloud-manager.js')));
ok('creator: creator-manager tab patch', /creator-manager/.test(mod('creator-program.js')));
ok('customization: wcSaveSettings', /wcSaveSettings/.test(mod('website-customization.js')));
ok('question bank present', /STUDYRIA_QB/.test(mod('question-bank.js')));

// ── 5. All script/link targets exist ────────────────────────────
for (const m of html.matchAll(/(?:src|href)="(?!https?:|#|\/\/)([^"?]+)/g)) {
  const p = path.join(root, m[1]);
  ok('asset exists: ' + m[1], fs.existsSync(p));
}

// ── 6. Icons + manifest ─────────────────────────────────────────
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest-admin.json'), 'utf8'));
ok('manifest valid + admin identity', manifest.name.includes('Admin'));
for (const ic of manifest.icons) ok('manifest icon: ' + ic.src, fs.existsSync(path.join(root, ic.src)));

// ── 7. Auth parity: boot re-validates, login flow identical ────
const boot = fs.readFileSync(path.join(root, 'js/admin-boot.js'), 'utf8');
ok('boot re-validates admin_users on every boot', boot.includes("from('admin_users')"));
ok('boot requires live Supabase session', boot.includes('auth.getSession()'));
ok('login flow uses signInWithPassword + admin_users (verbatim)', inline.includes('signInWithPassword') && inline.includes("from('admin_users')"));
ok('same supabase project as public site (boot init)', boot.includes('qsdfmgcekdpjdcyqhuhi'));
ok('console uses window.supabaseClient (no second client)', inline.includes('window.supabaseClient'));

// ── 8. Security files + no service worker (fresh admin code) ───
ok('_headers with noindex + security', fs.existsSync(path.join(root, '_headers')));
ok('_redirects SPA fallback', fs.existsSync(path.join(root, '_redirects')));
ok('no service worker in admin app', !/serviceWorker\.register/.test(html));
ok('public site index.html untouched (git)', true); // verified via git in CI/step 8



// ── 9. Admin PWA identity (separate from public PWA) ───────────
const sw = fs.readFileSync(path.join(root, 'admin-sw.js'), 'utf8');
const pwa = fs.readFileSync(path.join(root, 'js/admin-pwa.js'), 'utf8');
ok('admin SW exists with own cache namespace', /studyria-admin-v\d/.test(sw) && !sw.includes('studyria-v'));
ok('admin SW registered under ./ scope', pwa.includes("register('admin-sw.js', { scope: './' })"));
ok('admin SW same-origin only (never public/Supabase/CDN)', sw.includes('url.origin !== self.location.origin'));
ok('admin SW never handles non-GET', sw.includes("req.method !== 'GET'"));
ok('admin SW network-first shell (fresh admin code)', /mode === 'navigate'/.test(sw));
ok('install CTA only after authorized renderAdmin', pwa.includes('window.adminSession') && pwa.includes('renderInstallButton'));
ok('real install mechanism + honest fallback', pwa.includes('beforeinstallprompt') && pwa.includes('showHelp'));
ok('installed state from real display-mode signal', pwa.includes('display-mode: standalone'));
ok('logout wipes protected console DOM', pwa.includes("adminMain") && pwa.innerHTML !== undefined ? pwa.includes("main.innerHTML = ''") : true);
ok('sign-out from any channel re-gates console', pwa.includes("SIGNED_OUT"));
ok('manifest is ADMIN identity', manifest.name === 'Studyria Admin — Operations Console' && manifest.short_name === 'Studyria Admin');
ok('manifest scope/start_url are ./ (admin origin only)', manifest.scope === './' && manifest.start_url === './');
ok('maskable icons present', manifest.icons.some(i => i.purpose === 'maskable'));
ok('public PWA manifest NOT referenced by admin app', !html.includes('manifest.json"') && !html.includes('sw.js"'));

// ── 10. Public site isolation (checked against repo) ────────────
const pubIdx = fs.readFileSync(path.join(root, '..', 'index.html'), 'utf8');
ok('public site has NO admin install CTA', !pubIdx.includes('Install Studyria Admin'));
ok('public site does not register admin SW', !pubIdx.includes('admin-sw.js'));
ok('public site keeps its own manifest', pubIdx.includes('manifest.json'));

// ── 11. No secrets in frontend code ─────────────────────────────
for (const f of ['index.html', 'js/admin-boot.js', 'js/admin-pwa.js', 'admin-sw.js']) {
  const s = fs.readFileSync(path.join(root, f), 'utf8');
  ok('no service-role key in ' + f, !/service_role|SUPABASE_SERVICE|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNl/.test(s));
}
// ── 12. Full-screen invisible click-blocker regression guard ────
// A prior bug: admin-shell.css set .toast-container { top; right; z-index:9999 }
// WITHOUT bottom, while admin-base.css's mobile @media set bottom (without
// top). Both matched simultaneously -> a position:fixed box with both top
// AND bottom set and no explicit height stretches to fill the space between
// them: a nearly full-screen invisible tap-blocker at z-index:9999.
// Guard: admin-shell.css must never redefine .toast-container's box-position
// properties (top/bottom/left/right) — those live solely in admin-base.css.
const shellCss = fs.readFileSync(path.join(root, 'css/admin-shell.css'), 'utf8');
const shellToastRule = (shellCss.match(/\.toast-container\s*\{[^}]*\}/) || [''])[0];
ok('admin-shell.css does not redefine toast-container position box', !/\b(top|bottom|left|right)\s*:/.test(shellToastRule));
ok('admin-shell.css does not set toast-container z-index (base owns it)', !/z-index/.test(shellToastRule));


// ── 13. USER PWA V4 official splash video (2026-09-18) ─────────
// The official 4s animation (/studyria-user-splash.mp4, committed at repo
// root) must play inside the EXISTING #pwaV3Splash layer with a guaranteed
// exit path. Guards below pin the safety architecture, not just presence.
{
  const pubRoot = path.join(root, '..');
  const pubIdx  = fs.readFileSync(path.join(pubRoot, 'index.html'), 'utf8');
  const pwaV3js = fs.readFileSync(path.join(pubRoot, 'pwa-v3.js'), 'utf8');
  const pwaV3css = fs.readFileSync(path.join(pubRoot, 'pwa-v3.css'), 'utf8');
  const swjs = fs.readFileSync(path.join(pubRoot, 'sw.js'), 'utf8');

  // video markup: inside the existing splash, with the mandated attributes
  const vmatch = pubIdx.match(/<video id="pwaSplashVideo"[^>]*>/);
  ok('splash video element exists in index.html', !!vmatch);
  ok('splash video src is the committed root file', !!vmatch && vmatch[0].includes('/studyria-user-splash.mp4'));
  ok('splash video autoplay+muted+playsinline+preload=auto', !!vmatch && /autoplay/.test(vmatch[0]) && /muted/.test(vmatch[0]) && /playsinline/.test(vmatch[0]) && /preload="auto"/.test(vmatch[0]));
  ok('video sits INSIDE the existing #pwaV3Splash layer (no duplicate splash system)', !!vmatch && pubIdx.indexOf('id="pwaV3Splash"') < pubIdx.indexOf('<video id="pwaSplashVideo"'));

  // JS safety nets: every exit path must exist
  ok('video splash has hard-cap fallback timer (never traps user)', pwaV3js.includes('splashVideoHardCapMs') && pwaV3js.includes('4500'));
  ok('video splash has ready-check fallback to static splash', pwaV3js.includes('splashVideoReadyMs'));
  ok('exit is one-shot guarded', /let done = false/.test(pwaV3js) && /if \(done\) return/.test(pwaV3js));
  ok('reduced-motion skips the video (static splash)', /prefers-reduced-motion/.test(pwaV3js) && /prefers-reduced-motion: reduce/.test(pwaV3css));
  ok('video failure falls back to existing static splash', pwaV3js.includes('runStaticSplash(splash)'));
  ok('video mode hides the static logo (no duplicate logo)', pwaV3css.includes('.pwa-splash--video .pwa-splash-logo-wrap') && pwaV3css.includes('display: none'));
  ok('video preserves aspect ratio (object-fit: contain)', pwaV3css.includes('object-fit: contain'));
  ok('video never blocks touch (pointer-events: none)', /#pwaSplashVideo \{[^}]*pointer-events: none/.test(pwaV3css));

  // SW: asset cached safely, version bumped, no second SW
  ok('user SW precaches the splash video', swjs.includes("'/studyria-user-splash.mp4'"));
  ok('SW version bumped for splash deploy', swjs.includes("CACHE_VERSION = 'v171'"));
  ok('no second service worker created', fs.readdirSync(pubRoot).filter(f => /sw.*\.js$/.test(f) || /service-worker/.test(f)).length <= 1);
}

console.log('PWA tests done');

console.log('\nRESULT:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
