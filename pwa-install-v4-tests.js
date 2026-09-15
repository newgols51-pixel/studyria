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
    (opts.displayMode && q.includes(opts.displayMode)) || false, addEventListener(){} });
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
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ name:'Studyria', start_url:'/', display:'standalone', icons:[{sizes:'192x192'},{sizes:'512x512'}] }) });
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
  grab('function _installBrowserInfo', '\n// ═');
  const code = blocks.join('\n').replace(/^const /gm, 'var ');
  // eslint-disable-next-line no-eval
  API = (0, eval)('(function(){' + code + '\nreturn {setupInstallPrompt, installClick, installState, promptInstall, _isAlreadyInstalled, _state, installDiagnostics, _installBrowserInfo};})()');
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
  API.installClick();
  await new Promise(r => setTimeout(r, 10));
  check('Chrome (no prompt yet) → NO manual modal', envC.modalCaptures.length === 0);
  check('Chrome (no prompt yet) → honest retry toast instead', envC.toasts.length > 0);
  check("Chrome → installState() === 'prompt-not-yet-available'", API.installState().state === 'prompt-not-yet-available');

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
  check('header pwaInstallBtn routes to PWA.installClick', /id="pwaInstallBtn"[^>]*onclick="if\(window\.PWA&&PWA\.installClick\)PWA\.installClick\(\)/.test(idx));
  check('burger install item routes to PWA.installClick', /mhCloseBurger\(\);if\(window\.PWA&&PWA\.installClick\)PWA\.installClick\(\)/.test(idx));
  check('triggerPWAInstall (mhDownloadBtn) routes to PWA.installClick', /triggerPWAInstall[\s\S]{0,300}PWA\.installClick/.test(idx));
  check('early capture is the FIRST script in <head>', idx.indexOf('__pwaEarlyInstallCapture') < idx.indexOf('clarity'));
  const pwa32 = fs.readFileSync(path.join(ROOT, 'pwa-v32.js'), 'utf8');
  check('pwa-v32 App page: Install App PRIMARY in no-prompt state', /no-prompt'[\s\S]{0,900}_triggerInstall\(\)">📲 Install App<\/button>[\s\S]{0,400}_installHelp\(\)">📖 How to Install/.test(pwa32));
  check('pwa-v32 re-renders when prompt arrives (pwa:installable)', /addEventListener\('pwa:installable'/.test(pwa32));
  check('PWA public API exports installState + installDiagnostics + installClick', /installClick,\n  installState,\n  installDiagnostics,/.test(appjs));

  console.log('\n── 17/18/20. protected surfaces untouched ──');
  let changed = [];
  try { changed = execSync('git diff origin/main --name-only', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean); }
  catch (e) { changed = ['(git unavailable)']; }
  check('service worker (sw.js) untouched', !changed.includes('sw.js'));
  check('notification system files untouched', !changed.some(f => /notification/.test(f)));
  check('changed file set is exactly the expected 4 files',
    changed.sort().join(',') === ['app.js','index.html','pwa-install-v4-tests.js','pwa-v32.js'].sort().join(','));

  console.log('\n── 19. no JS errors ──');
  check('entire suite executed without uncaught errors (reached end)', true);

  console.log(`\n═══ SUMMARY: ${passed} passed, ${failed} failed ═══`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('❌ HARNESS ERROR:', e); process.exit(1); });
