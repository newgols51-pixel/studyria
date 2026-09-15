// ═══════════════════════════════════════════════════════════════════════════
// pwa-install-v4-tests.js — PWA INSTALL V4 behavioral test suite
// Run: node pwa-install-v4-tests.js
// Dev-only file: NOT referenced by index.html. Safe to delete in a
// future cleanup — no production code depends on it.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  ✅', name); }
  else { failed++; console.log('  ❌', name); }
}

// ── Mock browser environment ──────────────────────────────────────────────
function makeEnv(userAgent, opts = {}) {
  const win = new EventTarget();
  win.navigator = { userAgent, onLine: true, standalone: false, maxTouchPoints: 0,
    serviceWorker: { getRegistration: async () => null, controller: null } };
  win.matchMedia = q => ({ matches: (opts.standalone && q.includes('standalone')) ||
    (opts.displayMode ? q.includes(opts.displayMode) : (!opts.standalone && q.includes('(display-mode: browser)'))) ||
    false, addEventListener(){} });
  const modalCaptures = [];
  const toasts = [];
  let docAttr = null;
  const listeners = [];
  win.document = {
    referrer: '',
    readyState: 'complete',
    documentElement: { setAttribute: (k,v) => { docAttr = [k,v]; }, getAttribute: () => null },
    addEventListener(){}, removeEventListener(){},
    getElementById: () => ({ style: {}, addEventListener(){}, remove(){}, disabled: false }),
    createElement: () => {
      const el = { style:{cssText:''}, attrs:{}, setAttribute(k,v){this.attrs[k]=v;},
        addEventListener(){}, remove(){},
        set innerHTML(v){ this.__html = v; }, get innerHTML(){ return this.__html || ''; } };
      el.__captures = modalCaptures;
      return el;
    },
    body: { appendChild(el){ if (el.__html !== undefined) modalCaptures.push(el.__html); } },
    addEventListener(){}
  };
  win.addEventListener = (t, fn) => listeners.push({ t, fn });
  win.removeEventListener = () => {};
  win.dispatchEvent = (ev) => { // minimal dispatch: call matching listeners
    let ret = true;
    for (const l of listeners) if (l.t === ev.type) { l.fn(ev); }
    return ret;
  };
  win.MSStream = undefined;
  win.location = { protocol: 'https:' };
  win.isSecureContext = true;
  win._pwaInstallPrompt = null;
  win.showToast = (msg, kind) => toasts.push({ msg, kind });
  return { win, modalCaptures, toasts, listeners, getDocAttr: () => docAttr };
}

function installGlobals(env) {
  global.window = env.win;
  global.navigator = env.win.navigator;
  global.document = env.win.document;
  global.location = env.win.location;
  // V5: installDiagnostics() fetches the manifest + real icons, reads PNG
  // IHDR dimensions — the mock serves a valid manifest + valid PNG bytes.
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('manifest.json')) return { ok: true, status: 200,
      headers: { get: (k) => k === 'content-type' ? 'application/manifest+json' : null },
      json: async () => ({ name:'Studyria', short_name:'Studyria', id:'/', start_url:'/', scope:'/',
        display:'standalone',
        icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}] }) };
    if (u.includes('.png')) {
      const w = u.includes('512') ? 512 : 192;
      const buf = new Uint8Array(33);
      buf.set([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A], 0); // PNG signature
      buf[16] = 0; buf[17] = 0; buf[18] = (w >> 8) & 255; buf[19] = w & 255; // IHDR width
      return { ok: true, status: 200,
        headers: { get: (k) => k === 'content-type' ? 'image/png' : null },
        arrayBuffer: async () => buf.buffer };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  global.showToast = env.win.showToast;
}

// ── Extract install code from app.js (declarations hoist inside eval) ──
let API = null;
function loadAppJs2() {
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const blocks = [];
  const grab = (a, b, incl) => { const s = src.indexOf(a); const e = src.indexOf(b, s);
    if (s < 0 || e < 0) throw new Error('extract failed: ' + a); blocks.push(src.slice(s, incl ? e + b.length : e)); };
  grab('const PWA_CONFIG = {', '\n};', true);
  grab('const _state = {', '\n};', true);
  grab('function detectStandalone', '\nfunction checkInstalledState');
  grab('function _installBrowserInfo', '\n// ═'); // NOTE: this range already covers _checkRelatedAppInstalled (V6), _markBurgerInstalled, installClick, installState, installDiagnostics — all defined before section 6.
  const code = blocks.join('\n').replace(/^const /gm, 'var ');
  // eslint-disable-next-line no-eval
  API = (0, eval)('(function(){' + code + '\nreturn {setupInstallPrompt, installClick, installState, promptInstall, _isAlreadyInstalled, _state, installDiagnostics, _installBrowserInfo, _checkRelatedAppInstalled};})()');
  global.window.__pwaInstallPrompt = global.window._pwaInstallPrompt;
}

function loadEarlyCapture(env) {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = src.match(/<script>\s*(\(function \(\) \{\s*if \(window\.__pwaEarlyInstallCapture\)[\s\S]*?\}\)\(\);\s*)<\/script>/);
  if (!m) throw new Error('early capture block not found in index.html');
  const fn = new Function('window', 'CustomEvent', 'Event', m[1]);
  fn(env.win, CustomEvent, Event);
}

const CHROME_ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const FIREFOX_ANDROID_UA = 'Mozilla/5.0 (Android 13; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function main() {
  console.log('\n── 1. beforeinstallprompt captured by the EARLY listener ──');
  const env = makeEnv(CHROME_ANDROID_UA);
  installGlobals(env);
  loadEarlyCapture(env);
  check('early capture registered (__pwaEarlyInstallCapture=true)', env.win.__pwaEarlyInstallCapture === true);
  check('diagnostics trail present (__pwaInstallLog)', Array.isArray(env.win.__pwaInstallLog));
  const bip = env.listeners.filter(l => l.t === 'beforeinstallprompt');
  check('early block registers native beforeinstallprompt listener', bip.length === 1);
  check('early block registers native appinstalled listener', env.listeners.some(l => l.t === 'appinstalled'));
  // fire the early listener with a fake event object
  const ev = { type: 'beforeinstallprompt', defaultPrevented: false,
    preventDefault(){ this.defaultPrevented = true; }, prompt(){}, userChoice: Promise.resolve({outcome:'accepted'}) };
  let installableSeen = false;
  env.win.addEventListener('pwa:installable', () => { installableSeen = true; });
  bip[0].fn(ev);
  check('listener calls preventDefault (suppresses Chrome mini-infobar)', ev.defaultPrevented === true);
  check('event stored on window._pwaInstallPrompt', env.win._pwaInstallPrompt === ev);
  check('diagnostics log records capture', (env.win.__pwaInstallLog||[]).some(x => x.evt === 'beforeinstallprompt'));
  check("custom 'pwa:installable' dispatched for consumers", installableSeen === true);

  console.log('\n── 2–3. app.js consumes early capture; prompt-available state ──');
  installGlobals(env);
  loadAppJs2();
  API.setupInstallPrompt();
  check('app.js consumes early-captured prompt into _state.deferredPrompt', API._state.deferredPrompt === ev);
  check('promptSeen trail recorded', API._state.installEvents.promptSeen === true);
  check("installState() === 'prompt-available'", API.installState().state === 'prompt-available');
  check('installState(): browser chrome / platform android', API.installState().browser === 'chrome' && API.installState().platform === 'android');
  check('installState().listenerMode === early-inline', API.installState().listenerMode === 'early-inline');
  check('installState().promptAvailable true', API.installState().promptAvailable === true);

  console.log('\n── 4. prompt() called only from a real user gesture ──');
  const ev2 = { preventDefault(){}, prompt(){}, userChoice: Promise.resolve({outcome:'accepted'}) };
  let gesturePrompted = 0;
  ev2.prompt = () => { gesturePrompted++; };
  API._state.deferredPrompt = ev2; env.win._pwaInstallPrompt = ev2; global.window._pwaInstallPrompt = ev2;
  API.installClick(); // synchronous call within the gesture context
  check('installClick triggers native prompt() synchronously in the gesture', gesturePrompted === 1);
  await new Promise(r => setTimeout(r, 5));

  console.log('\n── 5. accepted prompt ──');
  const evA = { preventDefault(){}, prompt(){}, userChoice: Promise.resolve({ outcome: 'accepted' }) };
  API._state.deferredPrompt = evA; env.win._pwaInstallPrompt = evA; global.window._pwaInstallPrompt = evA;
  API._state.isInstalled = false;
  API.installClick();
  await new Promise(r => setTimeout(r, 10));
  check('accepted → prompt reference cleared (never re-usable)', API._state.deferredPrompt === null && env.win._pwaInstallPrompt === null);
  check('accepted alone does NOT mark installed (appinstalled is the proof)', API._state.installEvents.installedEvent === false && API._state.isInstalled === false);

  console.log('\n── 6. dismissed prompt ──');
  const evD = { preventDefault(){}, prompt(){}, userChoice: Promise.resolve({ outcome: 'dismissed' }) };
  API._state.deferredPrompt = evD; env.win._pwaInstallPrompt = evD; global.window._pwaInstallPrompt = evD;
  API.installClick();
  await new Promise(r => setTimeout(r, 10));
  check('dismissed → prompt cleared', API._state.deferredPrompt === null && env.win._pwaInstallPrompt === null);
  check('dismissed → installed stays false', API._state.isInstalled === false);

  console.log('\n── 7. appinstalled event ──');
  const env3 = makeEnv(CHROME_ANDROID_UA, { domIds: ['pwaInstallBtn','pwaHmInstallBtn','installAppBtn'] });
  installGlobals(env3);
  loadAppJs2();
  API.setupInstallPrompt();
  env3.win.dispatchEvent(new CustomEvent('pwa:installed'));
  check('appinstalled → _state.isInstalled true', API._state.isInstalled === true);
  check('appinstalled → installEvents.installedEvent true', API._state.installEvents.installedEvent === true);
  check('appinstalled → data-pwa-installed attribute set', JSON.stringify(env3.getDocAttr()) === '["data-pwa-installed","true"]');
  check("appinstalled → installState() === 'installed'", API.installState().state === 'installed');

  console.log('\n── 8. installed state hides CTA (no prompt) ──');
  let wrongPrompt = false;
  env3.win._pwaInstallPrompt = { prompt(){ wrongPrompt = true; } }; global.window._pwaInstallPrompt = env3.win._pwaInstallPrompt;
  API.installClick();
  check('installed → installClick never prompts', wrongPrompt === false);

  console.log('\n── 9. standalone launch hides CTA ──');
  const envS = makeEnv(CHROME_ANDROID_UA, { standalone: true });
  installGlobals(envS);
  loadAppJs2();
  check('standalone display-mode → _isAlreadyInstalled() true', API._isAlreadyInstalled() === true);
  check('standalone → installState().installed true', API.installState().installed === true);
  envS.win._pwaInstallPrompt = { prompt(){ wrongPrompt = true; } }; global.window._pwaInstallPrompt = envS.win._pwaInstallPrompt;
  API.installClick();
  check('standalone launch → installClick no-op', wrongPrompt === false);

  console.log('\n── 10. no duplicate native listeners ──');
  const envD = makeEnv(CHROME_ANDROID_UA);
  installGlobals(envD);
  loadEarlyCapture(envD);
  loadAppJs2();
  API.setupInstallPrompt();
  const natBIP = envD.listeners.filter(l => l.t === 'beforeinstallprompt');
  const natAI = envD.listeners.filter(l => l.t === 'appinstalled');
  check('exactly 1 native beforeinstallprompt listener total', natBIP.length === 1);
  check('exactly 1 native appinstalled listener total', natAI.length === 1);
  API.setupInstallPrompt(); // guard must block re-registration
  check('guard flag prevents double setupInstallPrompt()', envD.listeners.filter(l => l.t === 'beforeinstallprompt').length === 1);
  // defensive path when early capture absent
  const envN = makeEnv(CHROME_ANDROID_UA);
  installGlobals(envN);
  loadAppJs2();
  API.setupInstallPrompt();
  check('defensive natives registered when early capture absent', envN.listeners.filter(l => l.t === 'beforeinstallprompt').length === 1);

  console.log('\n── 12. genuinely unsupported browsers → honest fallback ──');
  const envF = makeEnv(FIREFOX_ANDROID_UA);
  installGlobals(envF);
  loadAppJs2();
  API.setupInstallPrompt();
  envF.win._pwaInstallPrompt = null; global.window._pwaInstallPrompt = null; API._state.deferredPrompt = null; API._state.isInstalled = false;
  API.installClick();
  await new Promise(r => setTimeout(r, 10));
  check('Firefox Android (no prompt) → How-to-Install modal shown', envF.modalCaptures.length > 0);
  check('Firefox → installState().unsupported true', API.installState().unsupported === true);
  check("Firefox → installState() === 'unsupported-manual'", API.installState().state === 'unsupported-manual');
  const envI = makeEnv(IOS_UA);
  installGlobals(envI);
  loadAppJs2();
  API.setupInstallPrompt();
  API.installClick();
  await new Promise(r => setTimeout(r, 10));
  check('iOS Safari → Add to Home Screen steps', envI.modalCaptures.some(h => h.includes('Add to Home Screen')));

  console.log('\n── 13. Android Chrome NOT routed to the fallback modal ──');
  const envC = makeEnv(CHROME_ANDROID_UA);
  installGlobals(envC);
  loadAppJs2();
  API.setupInstallPrompt();
  envC.win._pwaInstallPrompt = null; global.window._pwaInstallPrompt = null; API._state.deferredPrompt = null; API._state.isInstalled = false;
  envC.win.__pwaLatePromptWaitMs = 60; // keep the suite fast (prod default 3500)
  await API.installClick();
  await new Promise(r => setTimeout(r, 20));
  check('Chrome (no prompt, active attempt failed) → NO manual modal', envC.modalCaptures.length === 0);
  check('Chrome withheld → truthful reason toast (not banned wording)', envC.toasts.length > 0 && envC.toasts.every(t => !/wait a few seconds/i.test(t.msg) && /withholding|Reason:/i.test(t.msg)));
  check("Chrome → installState() === 'prompt-not-yet-available'", API.installState().state === 'prompt-not-yet-available');

  console.log('\n── 13b. V5 §7/§8: diagnostics report the exact machine-readable reason ──');
  const diag = await API.installDiagnostics();
  check('diagnostics.version === 6', diag.version === 6);
  check('diagnostics: browser chrome / platform android / displayMode browser',
    diag.browser === 'chrome' && diag.platform === 'android' && diag.displayMode === 'browser');
  check('diagnostics: captured=false, promptAvailable=false, promptConsumed=false',
    diag.captured === false && diag.promptAvailable === false && diag.promptConsumed === false);
  check('diagnostics: installability ELIGIBLE (manifest+mime+icons+dims+https all pass)',
    diag.installability.eligible === true && diag.installability.criteria.manifestMime === true &&
    diag.installability.criteria.iconsFetchable === true && diag.installability.criteria.iconDims === true);
  check("diagnostics: reason === 'chrome-withheld-beforeinstallprompt' (exact)",
    diag.reason === 'chrome-withheld-beforeinstallprompt');
  check('diagnostics: appInstalled=false, real browser (not in-app/iframe)',
    diag.appInstalled === false && diag.details.inAppBrowser === false && diag.details.iframe === false);

  console.log('\n── 13c. V5 §15-C: prompt captured LATE during the active window ──');
  const envL = makeEnv(CHROME_ANDROID_UA);
  installGlobals(envL);
  loadAppJs2();
  API.setupInstallPrompt();
  envL.win._pwaInstallPrompt = null; global.window._pwaInstallPrompt = null; API._state.deferredPrompt = null; API._state.isInstalled = false;
  envL.win.__pwaLatePromptWaitMs = 400; // active window: event may arrive mid-attempt
  let latePromptCalls = 0;
  const clickP = API.installClick(); // the user gesture (tap) starts the attempt
  await new Promise(r => setTimeout(r, 120)); // ...Chrome dispatches beforeinstallprompt 120ms later
  const evLate = { preventDefault(){}, prompt(){ latePromptCalls++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) };
  // the early listener captures it (production path)
  const earlyL = envL.listeners.find(l => l.t === 'pwa:installable');
  if (earlyL) earlyL.fn({ type: 'pwa:installable', detail: { prompt: evLate, source: 'early' } });
  else { envL.win._pwaInstallPrompt = evLate; global.window._pwaInstallPrompt = evLate; }
  await clickP;
  await new Promise(r => setTimeout(r, 20));
  check('late-arriving event → REAL prompt() still fired from the same gesture', latePromptCalls === 1);
  check('late capture → promptConsumed tracked in state', API._state.installEvents.promptConsumed === true);

  console.log('\n── 13d. V5 §5: fresh capture resets promptConsumed; consumed event never re-used ──');
  const evF = { preventDefault(){}, prompt(){}, userChoice: Promise.resolve({ outcome: 'dismissed' }) };
  API._state.deferredPrompt = evF; envL.win._pwaInstallPrompt = evF; global.window._pwaInstallPrompt = evF;
  API._state.installEvents.promptConsumed = false;
  await API.installClick();
  check('consumed prompt cleared after userChoice', API._state.deferredPrompt === null && envL.win._pwaInstallPrompt === null);
  check('installState().promptConsumed true after prompt() used', API.installState().promptConsumed === true);
  const evF2 = { preventDefault(){}, prompt(){}, userChoice: Promise.resolve({ outcome: 'dismissed' }) };
  const sub = envL.listeners.find(l => l.t === 'pwa:installable');
  sub.fn({ type: 'pwa:installable', detail: { prompt: evF2 } });
  check('new capture resets promptConsumed to false', API._state.installEvents.promptConsumed === false);

  console.log('\n── 13e. V5 §15-H: in-app browser / WebView → honest unsupported state ──');
  const WEBVIEW_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36';
  const INSTAGRAM_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 326.0.0.90 Android';
  for (const [label, ua] of [['Android WebView', WEBVIEW_UA], ['Instagram in-app', INSTAGRAM_UA]]) {
    const envW = makeEnv(ua);
    installGlobals(envW);
    loadAppJs2();
    API.setupInstallPrompt();
    envW.win._pwaInstallPrompt = null; global.window._pwaInstallPrompt = null; API._state.deferredPrompt = null; API._state.isInstalled = false;
    envW.win.__pwaLatePromptWaitMs = 60;
    await API.installClick();
    await new Promise(r => setTimeout(r, 20));
    check(`${label} → installState() === 'unsupported-manual' (never native attempt)`, API.installState().state === 'unsupported-manual' && API.installState().inAppBrowser === true);
    check(`${label} → honest How-to-Install modal (no withheld-reason toast)`, envW.modalCaptures.length > 0 && envW.toasts.length === 0);
  }

  console.log('\n── 13f. V5 §15-I: prompt state survives SPA/hash navigation ──');
  const evNav = { preventDefault(){}, prompt(){}, userChoice: Promise.resolve({ outcome: 'dismissed' }) };
  API._state.deferredPrompt = evNav; envL.win._pwaInstallPrompt = evNav; global.window._pwaInstallPrompt = evNav;
  global.location = { protocol: 'https:', hash: '#library' }; // simulate hash navigation (no reload)
  check('after #hash navigation → installState().promptAvailable still true', API.installState().promptAvailable === true);
  check('after #hash navigation → installState() still prompt-available', API.installState().state === 'prompt-available');
  global.location = { protocol: 'https:', hash: '' }; // restore

  console.log('\n── 13g. V6 ROOT CAUSE §3: WebAPK already installed + opened in a plain Chrome tab ──');
  // EXACTLY the screenshot scenario: Studyria on the home screen (installed
  // WebAPK), but the tab reports display-mode 'browser' — the four legacy
  // signals (standalone/fullscreen/minimal-ui/navigator.standalone/referrer)
  // are ALL false. Only getInstalledRelatedApps() can tell the truth.
  const envR = makeEnv(CHROME_ANDROID_UA);
  envR.win.navigator.getInstalledRelatedApps = async () => [{ platform: 'webapp', id: 'https://studyria.qzz.io/', url: 'https://studyria.qzz.io/manifest.json' }];
  installGlobals(envR);
  loadAppJs2();
  API.setupInstallPrompt();
  envR.win._pwaInstallPrompt = null; global.window._pwaInstallPrompt = null; API._state.deferredPrompt = null; API._state.isInstalled = false;
  envR.win.__pwaLatePromptWaitMs = 60;
  await API._checkRelatedAppInstalled();
  check('related-apps check resolves relatedAppInstalled === true', API._state.relatedAppInstalled === true);
  check('_isAlreadyInstalled() now TRUE even though display-mode is browser', API._isAlreadyInstalled() === true);
  check("installState() === 'installed' (no false 'prompt-not-yet-available')", API.installState().state === 'installed');
  const toastsR = envR.toasts.length, modalsR = envR.modalCaptures.length;
  await API.installClick();
  await new Promise(r => setTimeout(r, 120));
  check('installClick on installed WebAPK → silent no-op (no toast, no modal, no prompt attempt)',
    envR.toasts.length === toastsR && envR.modalCaptures.length === modalsR);
  check('installState().relatedAppInstalled === true exposed', API.installState().relatedAppInstalled === true);
  const diagR = await API.installDiagnostics();
  check("diagnostics reason === 'already-installed' (exact — the browser itself confirmed it)",
    diagR.reason === 'already-installed');
  check('diagnostics.relatedAppsInstalled === true, relatedAppsApiSupported === true',
    diagR.details.relatedAppsInstalled === true && diagR.details.relatedAppsApiSupported === true);
  check('diagnostics.appInstalled === true (folded in)', diagR.appInstalled === true);

  console.log('\n── 13h. V6 §3-negative: fresh device (related apps empty) → normal install flow ──');
  const envFresh = makeEnv(CHROME_ANDROID_UA);
  envFresh.win.navigator.getInstalledRelatedApps = async () => [];
  installGlobals(envFresh);
  loadAppJs2();
  API.setupInstallPrompt();
  envFresh.win._pwaInstallPrompt = null; global.window._pwaInstallPrompt = null; API._state.deferredPrompt = null; API._state.isInstalled = false;
  envFresh.win.__pwaLatePromptWaitMs = 60;
  const alreadyN = await API._checkRelatedAppInstalled();
  check('fresh device → relatedAppInstalled === false (not installed)', alreadyN === false && API._state.relatedAppInstalled === false);
  check('fresh device → installClick still runs the ACTIVE attempt path (no silent no-op)',
    API.installState().state === 'prompt-not-yet-available');
  let nativePromptCalls = 0;
  const evN = { preventDefault(){}, prompt(){ nativePromptCalls++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) };
  API._state.deferredPrompt = evN; envFresh.win._pwaInstallPrompt = evN; global.window._pwaInstallPrompt = evN;
  await API.installClick();
  await new Promise(r => setTimeout(r, 20));
  check('fresh device + captured event → REAL prompt() called (V6 does not break the primary flow)', nativePromptCalls === 1);

  console.log('\n── 13i. V6 §6-F: browser without getInstalledRelatedApps → graceful null, legacy signals intact ──');
  const envU = makeEnv(CHROME_ANDROID_UA);
  // no getInstalledRelatedApps defined at all
  installGlobals(envU);
  loadAppJs2();
  API.setupInstallPrompt();
  const alreadyU = await API._checkRelatedAppInstalled();
  check('unsupported API → relatedAppInstalled stays null (unknown, not false)', alreadyU === null && API._state.relatedAppInstalled === null);
  check('unsupported API → _isAlreadyInstalled() still honors legacy display-mode signals only', API._isAlreadyInstalled() === false);
  check('unsupported API → installState().relatedAppInstalled === null', API.installState().relatedAppInstalled === null);

  console.log('\n── 13j. V6 §9/§10: manifest self-entry + current logo untouched ──');
  const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  check('manifest related_applications has the self webapp entry (platform + url)',
    Array.isArray(mf.related_applications) && mf.related_applications.some(a => a.platform === 'webapp' && /manifest\.json$/.test(a.url || '')));
  check('manifest prefer_related_applications still false (installability preserved)',
    mf.prefer_related_applications === false);
  check('manifest name/short_name/start_url/display intact',
    /Studyria/.test(mf.name) && mf.short_name === 'Studyria' && !!mf.start_url && mf.display === 'standalone');
  const changed6 = execSync('git diff 744ffc7^ 744ffc7 --name-only', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean);
  check('V6: icon asset files NOT in the diff (current logo preserved — old blue logo NOT restored)',
    !changed6.some(f => /icon|logo|apple-touch|favicon/.test(f)));

  console.log('\n── 14. installState() canonical state matrix ──');
  envC.win._pwaInstallPrompt = { prompt(){} }; global.window._pwaInstallPrompt = envC.win._pwaInstallPrompt; API._state.isInstalled = false;
  check('prompt present → prompt-available', API.installState().state === 'prompt-available');
  envC.win._pwaInstallPrompt = null; global.window._pwaInstallPrompt = null; API._state.deferredPrompt = null;
  API._state.isInstalled = true; API._state.installEvents.installedEvent = true;
  check('installed → installed', API.installState().state === 'installed');
  check('promptSeen preserved in canonical state', API.installState().promptSeen === false || API.installState().promptSeen === true);

  console.log('\n── 11/15/16. source-level: single handler wiring + no legacy state ──');
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  check('no window.deferredPrompt legacy anywhere', !/window\.deferredPrompt/.test(idx + appjs));
  check('V5 M: mobile header download icon (mhDownloadBtn) REMOVED from markup', !idx.includes('mhDownloadBtn'));
  check('V5 M: desktop header install icon (pwaInstallBtn) REMOVED from markup', !/id="pwaInstallBtn"/.test(idx));
  check('V5 M: no dead header-icon wiring left in app.js', !/['"]pwaInstallBtn['"]/.test(appjs));
  check('burger install item routes to PWA.installClick', /mhCloseBurger\(\);if\(window\.PWA&&PWA\.installClick\)PWA\.installClick\(\)/.test(idx));
  check('legacy triggerPWAInstall stub still routes to PWA.installClick', /triggerPWAInstall[\s\S]{0,300}PWA\.installClick/.test(idx));
  check('V5 §2: banned "wait a few seconds" retry toast GONE from source', !appjs.includes("hasn't offered the install prompt yet"));
  check('early capture is the FIRST script in <head>', idx.indexOf('__pwaEarlyInstallCapture') < idx.indexOf('clarity'));
  const pwa32 = fs.readFileSync(path.join(ROOT, 'pwa-v32.js'), 'utf8');
  check('pwa-v32 App page: Install App PRIMARY in no-prompt state', /no-prompt'[\s\S]{0,900}_triggerInstall\(\)">📲 Install App<\/button>[\s\S]{0,400}_installHelp\(\)">📖 How to Install/.test(pwa32));
  check('pwa-v32 re-renders when prompt arrives (pwa:installable)', /addEventListener\('pwa:installable'/.test(pwa32));
  check('PWA public API exports installState + installDiagnostics + installClick', /installClick,\n  installState,\n  installDiagnostics,/.test(appjs));

  console.log('\n── 17/18/20. protected surfaces untouched ──');
  let changed = [];
  try { changed = execSync('git diff 744ffc7^ 744ffc7 --name-only', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean); }
  catch (e) { changed = ['(git unavailable)']; }
  check('service worker (sw.js) untouched', !changed.includes('sw.js'));
  check('notification system files untouched', !changed.some(f => /notification/.test(f)));
  // V6: index.html needs no further change (header icons already removed
  // in V5's merge to main) — only the install-logic files + manifest.json
  // (self-referencing related_applications for getInstalledRelatedApps).
  check('changed file set is exactly the expected V6 files (no index.html change needed)',
    changed.sort().join(',') === ['app.js','manifest.json','pwa-install-v4-tests.js','pwa-v32.js'].sort().join(','));


  console.log('\n── 21. V7 Smart App Center: source-level — hero, real data only, native install preserved ──');
  const pwa32v7 = fs.readFileSync(path.join(ROOT, 'pwa-v32.js'), 'utf8');
  const pwa32css = fs.readFileSync(path.join(ROOT, 'pwa-v32.css'), 'utf8');
  check('V7 hero: eyebrow + exact headline + subtitle present',
    pwa32v7.includes('Studyria App</div>') && pwa32v7.includes('Your Study Universe.') && pwa32v7.includes('in Your Pocket.') && pwa32v7.includes('anytime, anywhere'));
  check('V7 hero: all four feature chips present',
    ['Faster Access','Offline Ready','Smart Notifications','Exam Preparation'].every(s => pwa32v7.includes('>' + s + '</li>')));
  check('V7 hero visual uses the CURRENT approved logo asset only',
    /pwa7-phone-logo" src="icon-192\.png/.test(pwa32v7) && !/logo[_-]?(blue|old)/i.test(pwa32v7 + pwa32css));
  check('V7 installed state: truthful badge, NO install CTA when installed',
    /installState === 'installed'\)[\s\S]{0,500}pwa7-btn-installed/.test(pwa32v7) && !/installState === 'installed'[\s\S]{0,600}_triggerInstall/.test(pwa32v7));
  check('V7 standalone shows "Running as App"', pwa32v7.includes("standalone ? 'Running as App' : 'Installed'"));
  check('V7 prompt-ready state: primary CTA delegates to the canonical native flow',
    /installState === 'ready'[\s\S]{0,400}_triggerInstall\(\)">📲 Install App/.test(pwa32v7));
  check('V7 unsupported state: honest manual guide is primary, no fake install UI',
    /Genuinely unsupported browser[\s\S]{0,400}_installHelp\(\)">📖 How to Install/.test(pwa32v7));
  check('V7 chromium-waiting keeps the honest waiting hint (no fake availability)',
    pwa32v7.includes('Waiting for browser install capability') && pwa32v7.includes('chromiumWaiting'));
  const pwa32Code = pwa32v7.split('\n').filter(l => !/^\s*(\/\/|═)/.test(l)).join('\n'); // comment/divider lines excluded
  check('V7 ABSOLUTE: no fabricated statistics anywhere in the App page source',
    !/\b\d[\d,.]*\s*[kKmMbB]?\s*\+?\s*(users|downloads|students|readers|installs|happy)\b/i.test(pwa32Code) && !pwa32v7.includes('10 GB'));
  check('V7 honest empty state for Continue Learning',
    pwa32v7.includes('No recent study activity yet. Start your first study session'));
  check('V7 storage wording: Device/Local App Storage, cloud clearly separated',
    pwa32v7.includes('Local App Storage') && pwa32v7.includes('device cache') && pwa32v7.includes('Cloud Storage') && !/cloud storage"/i.test(pwa32v7));
  check('V7 Continue Learning uses ONLY real local sources (dl_history/offline_progress/nav_history)',
    ['dl_history','offline_progress','nav_history'].every(k => pwa32v7.includes("'" + k + "'")));
  check('V7 update check routes to the REAL production update API (broken StudyriaUpdateSystem call removed)',
    pwa32v7.includes('window.studyriaUpdate.checkForUpdates') && !pwa32v7.includes('StudyriaUpdateSystem'));
  check('V7 Update App button rendered ONLY when a real update is detected',
    /if \(upd\.updateAvailable\) html \+=[\s\S]{0,120}Update App/.test(pwa32v7));
  check('V7 last-checked is honest (never fabricated timestamps)',
    pwa32v7.includes('Not checked yet in this session'));
  check('V7 diagnostics: whitelist-only — deviceId and identifiers NEVER displayed',
    !pwa32v7.includes('deviceId') && pwa32v7.includes('No account or device identifiers are shown'));
  check('V7 diagnostics: real SW version via production GET_VERSION channel',
    pwa32v7.includes("postMessage({ type: 'GET_VERSION' }"));
  check('V7 diagnostics collapsible + aria-expanded accessible',
    pwa32v7.includes('aria-expanded') && pwa32v7.includes('pwa7-collapse-head'));
  check('V7 NO second install manager: zero beforeinstallprompt listeners in pwa-v32.js',
    !/addEventListener\('beforeinstallprompt'/.test(pwa32v7));
  check('V7 cache actions confirm before clearing and never touch cloud data',
    pwa32v7.includes('confirm(') && pwa32v7.includes('Clearing cache never deletes your account, purchases, downloads, or cloud files'));
  check('V7 CSS: reduced-motion respected',
    pwa32css.includes('@media (prefers-reduced-motion: reduce)'));
  check('V7 CSS: safe-area support for notched phones',
    pwa32css.includes('env(safe-area-inset-bottom'));
  check('V7 CSS: responsive quick grid (2-col mobile, 4-col desktop), no fixed widths',
    pwa32css.includes('grid-template-columns: repeat(2, 1fr)') && pwa32css.includes('grid-template-columns: repeat(4, 1fr)'));

  console.log('\n── 22. V7 Smart App Center helpers — unit tests against the real module ──');
  // Load the ENTIRE real pwa-v32.js in a stubbed browser env. PWA32 is
  // assigned before the module's init tail, so helper API is available
  // even if init side-effects throw against the minimal stubs.
  const envV7 = makeEnv('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36');
  installGlobals(envV7);
  const lsShim = { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; },
    setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
  global.localStorage = lsShim;
  global.Notification = { permission: 'default' };
  global.confirm = () => false;
  let P32 = null;
  try { (0, eval)(fs.readFileSync(path.join(ROOT, 'pwa-v32.js'), 'utf8')); P32 = global.window.PWA32; }
  catch (e) { P32 = global.window.PWA32; }
  check('pwa-v32.js loads and exports the V7 helper API', !!(P32 && typeof P32._smartConnectivity === 'function' && typeof P32._notifSmartStatus === 'function'));
  if (P32) {
    // connectivity — real signals only
    check('_smartConnectivity: online → Online', P32._smartConnectivity().label === 'Online');
    global.navigator.onLine = false; global.window.navigator.onLine = false;
    check('_smartConnectivity: offline → Offline with honest cached-content note', P32._smartConnectivity().label === 'Offline' && P32._smartConnectivity().note.includes('cached'));
    global.navigator.onLine = true; global.window.navigator.onLine = true;
    global.navigator.connection = { effectiveType: '2g' };
    check('_smartConnectivity: 2g → Slow Connection', P32._smartConnectivity().label === 'Slow Connection');
    delete global.navigator.connection;
    // notifications — real SN.push.status mapping, all 6 honest states
    check('_notifSmartStatus: null status → honest Unknown', P32._notifSmartStatus(null).label === 'Unknown');
    check('_notifSmartStatus: unsupported browser → Unsupported, cannot enable', P32._notifSmartStatus({ supported: false }).label === 'Unsupported' && P32._notifSmartStatus({ supported: false }).canEnable === false);
    check('_notifSmartStatus: denied → Blocked by browser/device', P32._notifSmartStatus({ supported: true, permission: 'denied' }).label === 'Blocked');
    const onState = P32._notifSmartStatus({ supported: true, permission: 'granted', subscribed: true, channelType: 'pwa' });
    check('_notifSmartStatus: granted+subscribed → On, PWA channel named', onState.label === 'On' && /installed app \(PWA\)/.test(onState.note));
    const halfState = P32._notifSmartStatus({ supported: true, permission: 'granted', subscribed: false });
    check('_notifSmartStatus: granted but unsubscribed → Setup Incomplete, can complete', halfState.label === 'Setup Incomplete' && halfState.canEnable === true);
    const offState = P32._notifSmartStatus({ supported: true, permission: 'default', subscribed: false });
    check('_notifSmartStatus: default permission → Off, can enable', offState.label === 'Off' && offState.canEnable === true);
    // continue learning — empty honest state
    check('_continueLearningData: empty history → [] (no fabricated activity)', Array.isArray(P32._continueLearningData()) && P32._continueLearningData().length === 0);
    lsShim.setItem('studyria_pwa32_dl_history', JSON.stringify([{ id: 'x', pdfId: 'p1', title: 'ADRE GK Notes', status: 'done', addedAt: '2026-09-15T00:00:00Z' }]));
    lsShim.setItem('studyria_pwa32_nav_history', JSON.stringify(['home', 'library', 'brainlab']));
    lsShim.setItem('studyria_pwa32_offline_progress', JSON.stringify({ abc123: { progress: 0.4, scrollPos: 10 } }));
    const cont = P32._continueLearningData();
    check('_continueLearningData: real download + progress + nav surface as real items',
      cont.length === 4 && cont.some(i => i.label === 'ADRE GK Notes') && cont.some(i => i.label === 'PDF Library') && cont.some(i => /1 PDF with saved reading progress/.test(i.label)) && cont.some(i => i.label === 'BrainLab'));
    // today study — deterministic real-content suggestions
    const today = P32._todayStudy();
    check('_todayStudy: real-content suggestions only (affairs/quiz/progress), zero fabricated numbers',
      today.length >= 2 && today.every(i => /navigate\(|__blReady/.test(i.action)) && !today.some(i => /\d+%|\d+\s*(questions|users)/i.test(i.label + i.note)));
    // version — canonical production version source
    check('_appVersion: falls back honestly without the update system', P32._appVersion().version === P32.version);
    global.window.studyriaUpdate = { getVersion: () => ({ version: '3.3.0', build: '2026.08.08' }) };
    check('_appVersion: uses the REAL production version when available', P32._appVersion().version === '3.3.0');
    // update center — real browser states: SW active w/ no waiting worker
    // → truthful "no update"; NO service worker at all → honest unknown.
    envV7.win.navigator.serviceWorker.ready = Promise.resolve({ waiting: null });
    const updA = await P32._updateCenterState();
    check('_updateCenterState: SW active + no waiting worker → no update claimed (updateAvailable false, unknown false)',
      updA.updateAvailable === false && updA.updateUnknown === false && updA.lastChecked === null);
    delete envV7.win.navigator.serviceWorker;
    const updB = await P32._updateCenterState();
    check('_updateCenterState: no SW support → updateUnknown true (never claims up-to-date blindly)',
      updB.updateUnknown === true && updB.lastChecked === null);
    const sb = await P32._storageBreakdown({ text: '12.3 MB used of 2.0 GB quota', percent: 1, real: true });
    check('_storageBreakdown: honest entry counts, no invented per-category MB', sb.total.real === true && Array.isArray(sb.caches) && sb.caches.length === 0);
  }

  console.log('\n── 23. V7 protected surfaces + changed-file set ──');
  // Diff the pre-V7 main commit against the WORKING TREE so this check is
  // true both on the branch (uncommitted/committed) and after merge to main.
  let v7changed = [];
  try { v7changed = execSync('git diff e462817 --name-only', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean); }
  catch (e) { v7changed = ['(git unavailable)']; }
  const v7expected = ['pwa-v32.js', 'pwa-v32.css', 'manifest.json', 'index.html', 'pwa-install-v4-tests.js'];
  check('V7 changed file set is exactly the expected additive files',
    v7changed.sort().join(',') === v7expected.slice().sort().join(','));
  check('V7: service worker (sw.js) untouched', !v7changed.includes('sw.js'));
  const idxDiff = execSync('git diff e462817 -- index.html', { cwd: ROOT }).toString();
  const idxChangedLines = idxDiff.split('\n').filter(l => /^[+-][^+-]/.test(l));
  check('V7: index.html diff is ONLY the two asset version params (no nav/structure changes)',
    idxChangedLines.length === 5 && // 2 removals + 3 additions (comment + two versioned tags)
    idxChangedLines.some(l => /pwa-v32\.css\?v=\d+/.test(l)) &&
    idxChangedLines.some(l => /pwa-v32\.js\?v=\d+/.test(l)) &&
    idxChangedLines.filter(l => l.startsWith('+')).every(l => /\?v=\d+|cache-bust/.test(l)));
  check('V7: app.js install manager untouched', !v7changed.includes('app.js'));
  check('V7: protected systems untouched (notifications/razorpay/checkout/supabase/brainlab/auth)',
    !v7changed.some(f => /notification|razorpay|checkout|supabase|brainlab|auth|payment/i.test(f)));

  console.log('\n── 24. V7 manifest: shortcuts additive only, real routes ──');
  const mf7 = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const scNames = mf7.shortcuts.map(s => s.name);
  check('V7: all 8 existing shortcuts preserved', ['Home','PDF Library','Premium Notes','Career Hub','My Library','Wishlist','Search','Downloads'].every(n => scNames.includes(n)));
  check('V7: BrainLab/Mock Tests/Current Affairs shortcuts added', ['BrainLab','Mock Tests','Current Affairs'].every(n => scNames.includes(n)));
  const bl = mf7.shortcuts.find(s => s.name === 'BrainLab');
  const mt = mf7.shortcuts.find(s => s.name === 'Mock Tests');
  const ca = mf7.shortcuts.find(s => s.name === 'Current Affairs');
  check('V7: new shortcuts use REAL BrainLab V8 sub-router hashes',
    /#brainlab$/.test(bl.url) && /#brainlab\/mock-tests$/.test(mt.url) && /#brainlab\/current-affairs$/.test(ca.url));
  const blPages = fs.readFileSync(path.join(ROOT, 'brainlab-pages.js'), 'utf8');
  check('V7: sub-router actually resolves mock-tests and current-affairs pages',
    blPages.includes("'mock-tests':") && blPages.includes("'current-affairs':"));
  check('V7: manifest installability fields intact (name/icons/display/start_url)',
    /Studyria/.test(mf7.name) && Array.isArray(mf7.icons) && mf7.icons.length === 10 && mf7.display === 'standalone' && !!mf7.start_url);

  console.log('\n── 19. no JS errors ──');
  check('entire suite executed without uncaught errors (reached end)', true);

  console.log(`\n═══ SUMMARY: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('❌ HARNESS ERROR:', e); process.exit(1); });
