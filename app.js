/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STUDYRIA PWA APPLICATION LAYER  v3.0  (Production-Ready)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Handles:
 *   - Service Worker registration & lifecycle
 *   - Install prompt (Android, Windows, Edge, Chrome) + iOS guidance
 *   - Update detection, "Update Now" + "Restart" flow
 *   - Offline / Online detection
 *   - Cache versioning & cleanup
 *   - Background Sync
 *   - PWA diagnostics & performance monitoring
 *   - OneSignal Web Push (init, subscription helpers, public API)
 *
 * IMPORTANT: This file is a supplementary PWA layer. If your page already
 * has an inline App Center engine (pwaAppCenter), this file will detect
 * that and defer install/update UI to it, only adding missing functionality.
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONFIGURATION & STATE
// ═══════════════════════════════════════════════════════════════════════════

const PWA_CONFIG = {
  NAME:              'Studyria',
  VERSION:           '3.1.0',
  SW_PATH:           '/sw.js',
  SW_SCOPE:          '/',
  OFFLINE_PAGE:      '/offline.html',

  // Must match CACHE_NAME in sw.js
  CACHE_NAME:        'studyria-v90',

  // How often to poll for SW updates (4 hours)
  UPDATE_INTERVAL_MS: 4 * 60 * 60 * 1000,
};

// Internal mutable state (not exposed directly)
const _state = {
  swRegistration:   null,
  waitingSW:        null,
  deferredPrompt:   null,   // beforeinstallprompt event (single canonical reference)
  isInstalled:      false,
  isOnline:         typeof navigator !== 'undefined' ? navigator.onLine : true,
  updateDismissed:  false,
  initialized:      false,
  updateCheckTimer: null,
  // V4 — canonical install event trail (real signals only, per-device):
  installEvents: {
    promptSeen:      false,  // beforeinstallprompt actually captured
    promptAt:        null,   // timestamp
    promptConsumed:  false,  // prompt() already called on the captured event
    installedEvent:  false   // appinstalled actually fired
  }
};

// Capability flags (set once at init)
const _caps = {
  sw:           'serviceWorker' in navigator,
  sync:         false,     // set after SW registers
  periodicSync: false,     // set after SW registers
  pushManager:  false,     // set after SW registers
};

// Performance counters
const _metrics = {
  cacheHits:    0,
  cacheMisses:  0,
  netErrors:    0,
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. STANDALONE / INSTALLED DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * detectStandalone — returns true ONLY when the browser confirms the PWA is
 * actually running as an installed app (outside the normal browser tab UI).
 *
 * ✅  display-mode media queries   — Android, Chrome, Edge, Samsung Internet
 * ✅  navigator.standalone === true — iOS Safari Add-to-Home-Screen
 * ✅  android-app:// referrer      — Android TWA / WebAPK wrapper
 *
 * ❌  NEVER use URL parameters such as ?source=pwa.
 *     The manifest start_url may contain ?source=pwa, which is appended even
 *     when the page is opened in a normal browser tab — making it completely
 *     unreliable as an install signal.
 * ❌  NEVER use localStorage / sessionStorage / cookies / custom flags.
 */
function detectStandalone() {
  // CSS display-mode: standalone fires only when running as installed PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // display-mode: fullscreen / minimal-ui also indicate PWA launch
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  // iOS Safari sets navigator.standalone = true on Add-to-Home-Screen launch
  if (window.navigator.standalone === true) return true;
  // Android TWA: referrer is set to the android-app:// origin by the wrapper
  if (document.referrer.startsWith('android-app://')) return true;
  return false;
}

function checkInstalledState() {
  _state.isInstalled = detectStandalone();
  document.documentElement.setAttribute(
    'data-pwa-installed',
    _state.isInstalled ? 'true' : 'false'
  );
  if (_state.isInstalled) {
    console.log('[PWA] Running in standalone / installed mode ✅');
  } else {
    console.log('[PWA] Running in browser tab — not yet installed');
  }

  // Watch all display-mode variants so we catch dynamic state changes
  // (e.g. user installs while page is open)
  ['standalone', 'fullscreen', 'minimal-ui'].forEach(function(mode) {
    var mq = window.matchMedia('(display-mode: ' + mode + ')');
    if (mq.addEventListener) {
      mq.addEventListener('change', function() {
        var nowInstalled = detectStandalone();
        if (nowInstalled !== _state.isInstalled) {
          _state.isInstalled = nowInstalled;
          document.documentElement.setAttribute(
            'data-pwa-installed',
            _state.isInstalled ? 'true' : 'false'
          );
          console.log('[PWA] Install state changed → isInstalled:', _state.isInstalled);
          window.dispatchEvent(new CustomEvent('pwa:installstatechange', {
            detail: { isInstalled: _state.isInstalled }
          }));
        }
      });
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. SERVICE WORKER REGISTRATION & LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

async function registerServiceWorker() {
  if (!_caps.sw) {
    console.warn('[PWA] Service Workers not supported');
    return;
  }

  // pwaAppCenter registers sw.js on the 'load' event — if it has already done
  // so, reuse the existing registration instead of creating a second one.
  // Double-registration to the same scope is allowed by spec and won't break
  // anything, but it triggers an extra network fetch of sw.js and can cause a
  // transient race between two installations running concurrently.
  try {
    // Prefer an existing registration over a fresh one.
    const existing = await navigator.serviceWorker.getRegistration(PWA_CONFIG.SW_SCOPE);
    if (existing) {
      _state.swRegistration = existing;
      _caps.sync         = 'sync'         in existing;
      _caps.periodicSync = 'periodicSync' in existing;
      _caps.pushManager  = 'pushManager'  in existing;
      console.log('[PWA] Service Worker already registered — reusing ✅', existing.scope);

      if (existing.active) _querySwVersion(existing.active);
      if (existing.waiting && navigator.serviceWorker.controller) {
        _state.waitingSW = existing.waiting;
        _onUpdateReady(existing.waiting);
      }
      existing.addEventListener('updatefound', _onUpdateFound);
      navigator.serviceWorker.addEventListener('controllerchange', _onControllerChange);
      navigator.serviceWorker.addEventListener('message', _onSwMessage);
      _scheduleUpdateChecks();
      return;
    }
  } catch (_) { /* fall through to fresh registration */ }

  try {
    const reg = await navigator.serviceWorker.register(PWA_CONFIG.SW_PATH, {
      scope:          PWA_CONFIG.SW_SCOPE,
      updateViaCache: 'none',
    });
    _state.swRegistration = reg;

    _caps.sync         = 'sync'         in reg;
    _caps.periodicSync = 'periodicSync' in reg;
    _caps.pushManager  = 'pushManager'  in reg;

    console.log('[PWA] Service Worker registered ✅', reg.scope);

    if (reg.active) {
      _querySwVersion(reg.active);
    }

    if (reg.waiting && navigator.serviceWorker.controller) {
      _state.waitingSW = reg.waiting;
      _onUpdateReady(reg.waiting);
    }

    reg.addEventListener('updatefound', _onUpdateFound);
    navigator.serviceWorker.addEventListener('controllerchange', _onControllerChange);
    navigator.serviceWorker.addEventListener('message', _onSwMessage);
    _scheduleUpdateChecks();

  } catch (err) {
    console.error('[PWA] SW registration failed:', err);
  }
}

function _onUpdateFound() {
  const reg = _state.swRegistration;
  if (!reg) return;
  const installing = reg.installing;
  if (!installing) return;

  console.log('[PWA] New Service Worker installing…');

  installing.addEventListener('statechange', () => {
    if (installing.state === 'installed') {
      if (navigator.serviceWorker.controller) {
        // There was an existing SW — this is an update
        console.log('[PWA] New SW installed & waiting — update available');
        _state.waitingSW = installing;
        _onUpdateReady(installing);
      } else {
        // First install — no controller yet
        console.log('[PWA] Service Worker installed (first-time)');
      }
    }
  });
}

function _onControllerChange() {
  // A new SW has taken control. This fires after SKIP_WAITING.
  // We do NOT auto-reload here — the restart card asks the user first.
  console.log('[PWA] SW controller changed (update applied)');
  // The restart card is shown via showRestartCard(), called from applyUpdate()
}

function _onSwMessage(event) {
  const { type, data } = event.data || {};
  switch (type) {
    case 'cache_hit':      _metrics.cacheHits++;  break;
    case 'cache_miss':     _metrics.cacheMisses++; break;
    case 'network_error':  _metrics.netErrors++;   break;
    case 'sync_registered':
      console.log('[PWA] Background sync registered:', data?.tag);
      break;
    default:
      break;
  }
}

function _querySwVersion(sw) {
  try {
    const mc = new MessageChannel();
    mc.port1.onmessage = e => {
      const { version, build, whatsNew } = e.data || {};
      console.log('[PWA] SW version:', version || build);
      // Dispatch to page-level handlers if present
      window.dispatchEvent(new CustomEvent('pwa:swversion', {
        detail: { version: version || build, whatsNew }
      }));
    };
    sw.postMessage({ type: 'GET_VERSION' }, [mc.port2]);
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. UPDATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function _onUpdateReady(waitingSW) {
  // If the page's own App Center is present, let it handle UI
  if (window.pwaAppCenter) {
    // pwaAppCenter handles its own update UI — just ensure _waitingSW is set
    return;
  }
  showUpdateBanner(waitingSW);
}

/**
 * Fallback update banner (used if pwaAppCenter is NOT present in the page)
 */
function showUpdateBanner(waitingSW) {
  // Remove any existing banner first
  const existing = document.getElementById('_pwaUpdateBanner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = '_pwaUpdateBanner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
    'background:linear-gradient(135deg,#1a2540,#0d1830)',
    'border-bottom:1px solid rgba(147,2,5,0.3)',
    'padding:12px 16px', 'display:flex', 'align-items:center',
    'gap:12px', 'font-family:system-ui,sans-serif',
    'box-shadow:0 4px 24px rgba(0,0,0,0.5)',
  ].join(';');

  banner.innerHTML = `
    <div style="flex:1;min-width:0">
      <div style="color:#e4e8f0;font-weight:600;font-size:.9rem">🚀 New Version Available</div>
      <div style="color:#7a8caa;font-size:.78rem;margin-top:2px">What's New: bug fixes, performance & Career Hub improvements.</div>
    </div>
    <button id="_pwaUpdateNow"
      style="padding:8px 16px;background:linear-gradient(135deg,#930205,#c99a3c);color:#fff;border:none;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer;white-space:nowrap;flex-shrink:0">
      Update Now
    </button>
    <button id="_pwaUpdateLater"
      style="padding:8px 12px;background:rgba(255,255,255,0.07);color:#7a8caa;border:1px solid rgba(255,255,255,0.12);border-radius:8px;font-size:.8rem;cursor:pointer;flex-shrink:0">
      Later
    </button>
  `;

  document.body.insertAdjacentElement('afterbegin', banner);

  document.getElementById('_pwaUpdateNow').addEventListener('click', () => {
    applyUpdate();
  });

  document.getElementById('_pwaUpdateLater').addEventListener('click', () => {
    _state.updateDismissed = true;
    banner.remove();
  });
}

/**
 * Tell the waiting SW to skip waiting (activate immediately)
 * Then show the restart card / banner
 */
function applyUpdate() {
  const sw = _state.waitingSW || _state.swRegistration?.waiting;
  if (!sw) return;

  sw.postMessage({ type: 'SKIP_WAITING' });

  // Remove update banner if visible
  document.getElementById('_pwaUpdateBanner')?.remove();

  // If pwaAppCenter handles restart, let it; otherwise show our fallback
  if (!window.pwaAppCenter) {
    showRestartBanner();
  }
}

function showRestartBanner() {
  const existing = document.getElementById('_pwaRestartBanner');
  if (existing) return;

  const banner = document.createElement('div');
  banner.id = '_pwaRestartBanner';
  banner.setAttribute('role', 'status');
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
    'background:linear-gradient(135deg,#064e3b,#065f46)',
    'border-bottom:1px solid rgba(16,217,142,0.3)',
    'padding:12px 16px', 'display:flex', 'align-items:center',
    'gap:12px', 'font-family:system-ui,sans-serif',
    'box-shadow:0 4px 24px rgba(0,0,0,0.5)',
  ].join(';');

  banner.innerHTML = `
    <div style="flex:1">
      <div style="color:#e4e8f0;font-weight:600;font-size:.9rem">✅ Restart App to Finish Update</div>
      <div style="color:#a7f3d0;font-size:.78rem;margin-top:2px">Update installed! Restart to use the new version.</div>
    </div>
    <button id="_pwaRestartNow"
      style="padding:8px 16px;background:linear-gradient(135deg,#10d98e,#06b6d4);color:#fff;border:none;border-radius:8px;font-weight:600;font-size:.85rem;cursor:pointer;white-space:nowrap;flex-shrink:0">
      Restart Now
    </button>
  `;

  document.body.insertAdjacentElement('afterbegin', banner);

  document.getElementById('_pwaRestartNow').addEventListener('click', () => {
    window.location.reload();
  });
}

async function checkForUpdates() {
  try {
    if (!_state.swRegistration) return;
    console.log('[PWA] Checking for updates…');
    await _state.swRegistration.update();
  } catch (e) {
    console.warn('[PWA] Update check failed:', e);
  }
}

function _scheduleUpdateChecks() {
  // Check on visibility change (user returns to tab)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdates();
  });

  // Periodic check (4 hours)
  if (_state.updateCheckTimer) clearInterval(_state.updateCheckTimer);
  _state.updateCheckTimer = setInterval(checkForUpdates, PWA_CONFIG.UPDATE_INTERVAL_MS);

  // Also check once after 30 seconds (catches updates that land shortly after load)
  setTimeout(checkForUpdates, 30000);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. INSTALL PROMPT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * _installBrowserInfo — V4 §5: never classify a browser as "manual-install
 * only" from a naive UA rule alone. This helper ONLY decides how likely this
 * browser is to expose the real beforeinstallprompt natively, so the CTA can
 * keep offering the native flow instead of routing Chrome to a manual modal.
 */
function _installBrowserInfo() {
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  // iPadOS masquerades as macOS Safari — detect via touch + no Win/Mac pointer
  var isIPadOS = !isIOS && /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  var isAndroid = /android/i.test(ua);
  var isFirefox = /firefox\//i.test(ua);
  var isOperaMini = /Opera Mini|OPiOS/.test(ua);
  var isEdge = /edg\//i.test(ua);
  var isSamsung = /SamsungBrowser/.test(ua);
  var isOpera = /OPR\//.test(ua);
  var isChrome = /Chrome\/|Chromium\//.test(ua) && !isEdge && !isSamsung && !isOpera && !isOperaMini;
  // V5: in-app browsers / WebViews (Instagram, FB, Line, WebView "wv)", TikTok,
  // Snapchat, Telegram, in-app Chrome Custom Tabs) NEVER expose the native
  // beforeinstallprompt API the way a real browser does — detect honestly.
  var isAndroidWebView = isAndroid && /;\s*wv\)/.test(ua);
  var isInAppBrowser = isAndroidWebView || /FBAN|FBAV|Instagram|Line\/|\bSnapchat\b|TikTok|Twitter|Pinterest|LinkedInIn|MicroMessenger|MiuiBrowser.*\bwv\b/i.test(ua);
  // Chromium-family browsers implement beforeinstallprompt (Chrome, Edge,
  // Samsung Internet, Opera). Firefox / iOS / Opera Mini genuinely do NOT.
  // In-app browsers/WebView never get the real flow → honest manual state.
  var nativePromptLikely = !isIOS && !isIPadOS && !isFirefox && !isOperaMini && !isInAppBrowser &&
    (isChrome || isEdge || isSamsung || isOpera || (isAndroid && !isFirefox));
  var platform = isIOS || isIPadOS ? 'ios' : isAndroid ? 'android' : /Windows|Macintosh|Linux|CrOS/.test(ua) ? 'desktop' : 'other';
  var browser = isIOS || isIPadOS ? 'safari-ios' : isFirefox ? 'firefox' : isEdge ? 'edge'
    : isSamsung ? 'samsung' : isOpera ? 'opera' : isOperaMini ? 'opera-mini'
    : isChrome ? 'chrome' : 'other';
  return { isIOS: isIOS || isIPadOS, isAndroid: isAndroid, isFirefox: isFirefox,
           inAppBrowser: isInAppBrowser, androidWebView: isAndroidWebView,
           nativePromptLikely: nativePromptLikely, platform: platform, browser: browser };
}

function setupInstallPrompt() {
  // ── Global guard: only ONE install wiring ever exists ──
  if (window.__pwaInstallListenersRegistered) return;
  window.__pwaInstallListenersRegistered = true;

  // ── V4: consume a prompt already captured by the EARLY inline listener
  //    (index.html <head>). On slow devices Chrome can dispatch
  //    beforeinstallprompt before deferred JS executes — the early capture
  //    holds it; here we sync it into the canonical state. ──
  if (window._pwaInstallPrompt) {
    _state.deferredPrompt = window._pwaInstallPrompt;
    _state.installEvents.promptSeen = true;
    _state.installEvents.promptConsumed = false;
    _state.installEvents.promptAt = window.__pwaInstallLog && window.__pwaInstallLog.length
      ? window.__pwaInstallLog[window.__pwaInstallLog.length - 1].t : Date.now();
    console.log('[PWA] beforeinstallprompt already captured (early listener) ✅');
  }

  // ── Custom-event sync. The EARLY listener (or the defensive natives
  //    below) is the ONLY dispatch source of 'pwa:installable' /
  //    'pwa:installed'; app.js is a pure subscriber — never a re-dispatcher,
  //    so no double-handling is possible. ──
  window.addEventListener('pwa:installable', function (e) {
    var p = (e && e.detail && e.detail.prompt) ? e.detail.prompt : window._pwaInstallPrompt;
    if (!p) return;
    _state.deferredPrompt = p;
    window._pwaInstallPrompt = p;
    _state.installEvents.promptSeen = true;
    _state.installEvents.promptConsumed = false; // fresh event, usable once
    _state.installEvents.promptAt = Date.now();
    console.log('[PWA] beforeinstallprompt captured ✅ — native prompt ready');
    _updateInstallButtonVisibility();
  });

  window.addEventListener('pwa:installed', function () {
    console.log('[PWA] App installed ✅');
    _state.isInstalled = true;
    _state.installEvents.installedEvent = true;
    _state.deferredPrompt = null;
    window._pwaInstallPrompt = null;
    window._pwaInstallToastShown = true;
    document.documentElement.setAttribute('data-pwa-installed', 'true');

    _markBurgerInstalled();
    ['pwaHmInstallBtn'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) btn.style.display = 'none';
    });

    document.getElementById('_pwaInstallBanner')?.remove();

    if (window.gtag) {
      window.gtag('event', 'app_installed', { app_name: PWA_CONFIG.NAME });
    }

    if (typeof showToast === 'function') {
      showToast('✅ Studyria App installed!', 'success');
    }
  });

  // ── DEFENSIVE ONLY: register native listeners here when the early
  //    inline capture is absent (e.g. app.js loaded standalone). When it
  //    IS present (production index.html), exactly ONE native listener
  //    pair exists — the early one — and this path never runs. ──
  if (!window.__pwaEarlyInstallCapture) {
    console.warn('[PWA] early install capture not found — registering deferred native listeners');
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      window._pwaInstallPrompt = e;
      window.dispatchEvent(new CustomEvent('pwa:installable', { detail: { prompt: e, source: 'deferred' } }));
    });
    window.addEventListener('appinstalled', function () {
      window.dispatchEvent(new CustomEvent('pwa:installed', { detail: { source: 'deferred' } }));
    });
  }

  _updateInstallButtonVisibility();
  _bindInstallButton();
}

/**
 * Fallback install banner (used if pwaAppCenter is NOT in the page)
 */
function showInstallBanner() {
  if (document.getElementById('_pwaInstallBanner')) return;

  const banner = document.createElement('div');
  banner.id = '_pwaInstallBanner';
  banner.setAttribute('role', 'complementary');
  banner.style.cssText = [
    'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:99998', 'max-width:420px', 'width:calc(100% - 32px)',
    'background:linear-gradient(135deg,#0d1830,#121e38)',
    'border:1px solid rgba(147,2,5,0.25)',
    'border-radius:16px', 'padding:16px',
    'box-shadow:0 8px 40px rgba(0,0,0,0.6)',
    'font-family:system-ui,sans-serif',
    'animation:_pwaSlideUp .35s ease-out',
  ].join(';');

  // Inline keyframe
  if (!document.getElementById('_pwaAnimStyles')) {
    const style = document.createElement('style');
    style.id = '_pwaAnimStyles';
    style.textContent = `
      @keyframes _pwaSlideUp {
        from { opacity:0; transform:translateX(-50%) translateY(24px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:2rem;flex-shrink:0">📚</div>
      <div style="flex:1">
        <div style="color:#e4e8f0;font-weight:700;font-size:.95rem">Download / Install Studyria App</div>
        <div style="color:#7a8caa;font-size:.78rem;margin-top:2px">Offline access to your PDFs. No browser needed.</div>
      </div>
      <button id="_pwaInstallClose"
        style="background:none;border:none;color:#7a8caa;font-size:1.2rem;cursor:pointer;padding:4px;line-height:1;flex-shrink:0"
        aria-label="Close">✕</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="_pwaInstallConfirm"
        style="flex:1;padding:10px;background:linear-gradient(135deg,#930205,#c99a3c);color:#fff;border:none;border-radius:10px;font-weight:600;font-size:.9rem;cursor:pointer">
        ⬇ View & Install
      </button>
      <button id="_pwaInstallLater"
        style="padding:10px 14px;background:rgba(255,255,255,0.06);color:#7a8caa;border:1px solid rgba(255,255,255,0.1);border-radius:10px;font-size:.85rem;cursor:pointer">
        Later
      </button>
    </div>
  `;

  document.body.appendChild(banner);

  document.getElementById('_pwaInstallConfirm').addEventListener('click', function() { dismissInstallBanner(); if (typeof navigate === 'function') navigate('pwa'); });
  document.getElementById('_pwaInstallLater').addEventListener('click', dismissInstallBanner);
  document.getElementById('_pwaInstallClose').addEventListener('click', dismissInstallBanner);

  // Auto-dismiss after 15s if untouched
  setTimeout(dismissInstallBanner, 15000);
}

function dismissInstallBanner() {
  document.getElementById('_pwaInstallBanner')?.remove();
}

/**
 * _isAlreadyInstalled — true when the PWA is running in standalone mode
 * OR was recorded as installed during this session.
 */
function _isAlreadyInstalled() {
  return (
    _state.isInstalled ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  );
}

/**
 * _updateInstallButtonVisibility — hide button if installed, show if installable.
 * Safe to call multiple times.
 */
function _updateInstallButtonVisibility() {
  // V5: the header install icons (mhDownloadBtn / pwaInstallBtn) are REMOVED —
  // the App page's 📲 Install App is the one true install CTA. Only legacy
  // in-menu items (if a design re-adds one) are managed here.
  ['pwaHmInstallBtn'].forEach(function(id) {
    var btn = document.getElementById(id);
    if (!btn) return;

    if (_isAlreadyInstalled()) {
      btn.style.display = 'none';
      return;
    }

    btn.style.display   = '';
    btn.disabled        = false;
    btn.style.opacity   = '';
    btn.style.cursor    = '';
  });
}

/**
 * _bindInstallButton — ensures the burger Install button visibility is correct.
 * The button now uses onclick="navigate('pwa')" to open the App & Updates page.
 * No click listener is needed here — the PWA page handles the actual install.
 * Uses a guard flag so calling this multiple times is safe.
 */
function _bindInstallButton() {
  if (window.__pwaInstallBtnBound) return;

  // Button may not exist yet — wait for DOM
  function _attach() {
    var btn = document.getElementById('pwaHmInstallBtn');
    if (!btn) return false;

    if (window.__pwaInstallBtnBound) return true; // another call got here first
    window.__pwaInstallBtnBound = true;

    // If already installed, hide immediately and do nothing else
    if (_isAlreadyInstalled()) {
      btn.style.display = 'none';
      return true;
    }

    // No click listener — the button uses onclick="navigate('pwa')"
    // to open the unified App & Updates page, where the actual install
    // is handled by the canonical window.PWA.promptInstall() handler.

    return true;
  }

  if (!_attach()) {
    // DOM not ready yet — retry once after DOMContentLoaded
    document.addEventListener('DOMContentLoaded', _attach);
    // And again after a short delay for dynamically rendered menus
    setTimeout(_attach, 800);
    setTimeout(_attach, 2000);
  }
}

async function promptInstall() {
  // Never prompt if already installed
  if (_isAlreadyInstalled()) {
    _markBurgerInstalled();
    return;
  }

  var prompt = window._pwaInstallPrompt || _state.deferredPrompt;

  if (!prompt) {
    // No native prompt right now — shared honest fallback (V4): Chromium
    // browsers get a retry hint, genuinely unsupported ones get steps.
    _noPromptFallback();
    return;
  }

  try {
    prompt.prompt();
    _state.installEvents.promptConsumed = true; // event can never be re-used
    var result = await prompt.userChoice;
    console.log('[PWA] Install prompt outcome:', result.outcome);

    // Clear prompt so it can never be re-used
    _state.deferredPrompt    = null;
    window._pwaInstallPrompt = null;

    dismissInstallBanner();

    if (result.outcome === 'accepted') {
      // V4 §10: 'accepted' means the browser STARTED installing — the real
      // proof is the appinstalled event (the pwa:installed subscriber hides
      // every CTA then). Never mark installed from userChoice alone.
      window._pwaInstallToastShown = true;
      if (typeof showToast === 'function') showToast('📲 Installing Studyria…', 'info');
    }
  } catch (e) {
    console.warn('[PWA] Install prompt error:', e);
  }
}

/**
 * _markBurgerInstalled — hides the install button permanently after install.
 * Safe to call multiple times (idempotent).
 */
function _markBurgerInstalled() {
  // Hide all known install buttons
  ['pwaHmInstallBtn'].forEach(function(id) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.style.display = 'none';
    btn.disabled = true;
  });
  _state.isInstalled = true;
  document.documentElement.setAttribute('data-pwa-installed', 'true');
}

/**
 * iOS Add to Home Screen instructions (Safari does not support beforeinstallprompt)
 */
function showiOSInstallTip() { return showInstallHelp(); }

/**
 * showInstallHelp — platform-aware manual-install instructions (P22).
 * ONE centralized helper (all install surfaces call window.PWA — never
 * their own logic). Real platform detection, no fake states, never
 * claims a universal install method.
 */
function showInstallHelp() {
  // ── Capability detection (feature-first, UA only picks wording) ──
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  var isAndroid = /android/i.test(ua);
  var isFirefox = /firefox\//i.test(ua);
  var isEdge = /edg\//i.test(ua);
  var isSamsung = /SamsungBrowser/i.test(ua);
  var isOperaMini = /Opera Mini/i.test(ua) || /OPiOS/i.test(ua);

  // Chrome-family on Android exposes beforeinstallprompt; if we got here
  // without it, this browser requires menu installation (or is unsupported).
  var unsupported = isFirefox || isOperaMini || (!isAndroid && !isIOS && !/chrome|edg|safari/i.test(ua));

  var head, steps, note;
  if (isIOS) {
    head = 'Install Studyria on iPhone / iPad';
    steps = [
      'Open studyria.qzz.io in <strong>Safari</strong>',
      'Tap the <strong>Share</strong> button <span style="font-size:1.05rem">⬆</span> at the bottom',
      'Scroll down and tap <strong>Add to Home Screen</strong> <span style="font-size:1.05rem">➕</span>',
      'Tap <strong>Add</strong> — Studyria appears on your home screen'
    ];
    note = "Safari doesn't provide the automatic install prompt, but the steps above give you the same installed app.";
  } else if (isAndroid) {
    head = 'Install Studyria on Android';
    steps = [
      'Open studyria.qzz.io in <strong>Chrome</strong>' + (isSamsung ? ' or <strong>Samsung Internet</strong>' : '') + ' (or your current browser)',
      'Tap the browser menu <strong>⋮</strong> (top right)',
      'Tap <strong>Install app</strong> / <strong>Add to Home screen</strong> — the exact wording depends on your browser',
      'Confirm — Studyria appears on your home screen'
    ];
    note = "Your browser doesn't provide the automatic install prompt. You can still install Studyria from your browser menu — it works exactly the same.";
  } else if (unsupported && isFirefox) {
    head = 'Install Studyria on Firefox';
    steps = [
      'Firefox doesn\'t support full PWA installation on this platform',
      'You can bookmark studyria.qzz.io for quick access',
      'For the full app experience, use Chrome or Edge on this device'
    ];
    note = 'This is a browser limitation, not a problem with Studyria.';
  } else {
    head = 'Install Studyria on your computer';
    steps = [
      'Open studyria.qzz.io in ' + (isEdge ? '<strong>Edge</strong>' : '<strong>Chrome</strong>'),
      'Click the <strong>install icon</strong> ⊕ at the right end of the address bar',
      'Click <strong>Install</strong> — Studyria opens in its own app window'
    ];
    note = "Your browser doesn't provide the automatic install prompt. The address-bar option installs the same real app.";
  }

  document.getElementById('_pwaInstallHelp')?.remove();
  var ov = document.createElement('div');
  ov.id = '_pwaInstallHelp';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', head);
  ov.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'background:rgba(26,18,12,0.55)', 'backdrop-filter:blur(4px)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:20px', 'font-family:var(--font-body,system-ui,sans-serif)'
  ].join(';');

  ov.innerHTML = `
    <div style="background:linear-gradient(160deg,#faf7f2,#f3ecdd);border:1px solid rgba(147,2,5,0.18);border-radius:18px;max-width:420px;width:100%;padding:24px;box-shadow:0 24px 80px rgba(26,18,12,0.35);text-align:left;color:#2b2118">
      <div style="font-size:1.6rem;margin-bottom:4px">📱</div>
      <div style="font-weight:800;font-size:1.12rem;color:#930205;margin-bottom:6px">${head}</div>
      <div style="font-size:.84rem;color:#5c5145;margin-bottom:14px;line-height:1.5">
        Install Studyria for a faster, app-like study experience.
      </div>
      <div style="border-top:1px solid rgba(147,2,5,0.14);border-bottom:1px solid rgba(147,2,5,0.14);padding:10px 0;margin-bottom:14px">
        <div style="font-size:.76rem;color:#2b2118;line-height:2">
          <div>✓ Quick access from your home screen</div>
          <div>✓ App-like experience — no browser bars</div>
          <div>✓ Push notifications for exam alerts</div>
          <div>✓ Works great on slow connections</div>
        </div>
      </div>
      <ol style="margin:0 0 14px;padding-left:20px;color:#4a3f33;font-size:.86rem;line-height:1.8">
        ${steps.map(t => `<li>${t}</li>`).join('')}
      </ol>
      <div style="color:#8a7d6c;font-size:.74rem;line-height:1.5;margin-bottom:16px">${note}</div>
      <div style="display:flex;gap:10px">
        <button id="_pwaHelpOk" style="flex:1;padding:11px;background:linear-gradient(135deg,#930205,#b91c22);color:#fff;border:none;border-radius:10px;font-weight:700;cursor:pointer;min-height:44px;font-size:.9rem">Got it</button>
        <button id="_pwaHelpClose" style="padding:11px 16px;background:transparent;color:#8a7d6c;border:1px solid rgba(147,2,5,0.25);border-radius:10px;cursor:pointer;min-height:44px" aria-label="Close">✕</button>
      </div>
    </div>`;

  document.body.appendChild(ov);
  var close = function () { ov.remove(); document.removeEventListener('keydown', esc); };
  var esc = function (e) { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  document.getElementById('_pwaHelpOk').addEventListener('click', close);
  document.getElementById('_pwaHelpClose').addEventListener('click', close);
}

/**
 * _noPromptFallback — the ONE honest no-prompt path (V4 §5/§8/§12).
 * "Prompt not captured yet" and "browser genuinely has no native flow"
 * are DIFFERENT states and must not be conflated:
 *   • Chromium-family browser (Chrome/Edge/Samsung/Opera): the site is
 *     installable and the event may simply not have arrived yet (slow
 *     load) or Chrome temporarily withheld it — NEVER route these to
 *     the manual modal as if unsupported. Honest retry hint instead.
 *   • Browsers with no beforeinstallprompt implementation (iOS Safari,
 *     Firefox, Opera Mini, embedded WebViews): honest platform-specific
 *     install steps — the real, supported mechanism there.
 */
/**
 * _noPromptFallback — V5: ONLY for browsers that genuinely have no native
 * install flow (Firefox, iOS Safari, Opera Mini, in-app browsers/WebView).
 * Chromium browsers are NEVER routed here — for them installClick runs the
 * active real-prompt attempt (_awaitLatePrompt) instead.
 */
function _noPromptFallback() {
  showInstallHelp();
}

/**
 * _awaitLatePrompt — V5 §4/§9: ACTIVE attempt, run INSIDE the Install App
 * user gesture. When Chrome has not (yet) dispatched beforeinstallprompt at
 * tap time, nudge a service-worker update (this re-triggers Chrome's
 * installability evaluation) and poll for the capture for up to maxWaitMs.
 * Chrome's transient user-activation window (~5s) keeps prompt() legal for
 * a call made this close to the tap — so if the event arrives, the user
 * STILL gets the REAL native install dialog from this same gesture.
 * Returns a Promise<boolean>: true when a real prompt object is now held.
 */
function _awaitLatePrompt(maxWaitMs) {
  maxWaitMs = maxWaitMs || window.__pwaLatePromptWaitMs || 3500;
  return new Promise(function (resolve) {
    // Nudge Chrome's installability re-evaluation (never blocks, never throws)
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        navigator.serviceWorker.getRegistration()
          .then(function (r) { if (r && r.update) r.update().catch(function () {}); })
          .catch(function () {});
      }
    } catch (_) {}
    var t0 = Date.now();
    (function poll() {
      if (window._pwaInstallPrompt || _state.deferredPrompt) { resolve(true); return; }
      if (Date.now() - t0 >= maxWaitMs) { resolve(false); return; }
      setTimeout(poll, 150);
    })();
  });
}

/**
 * _reportWithheldPrompt — V5 §9: reached ONLY after the active attempt
 * failed on a Chromium browser that passes every installability criterion
 * (verified by installDiagnostics). At that point diagnostics have PROVEN
 * Chrome itself is withholding beforeinstallprompt on this device/profile.
 * Report the exact truthful reason — never "wait a few seconds", never a
 * fake prompt, never a silent no-op.
 */
async function _reportWithheldPrompt() {
  var d = await installDiagnostics();
  var msg = 'Studyria is fully install-ready — Chrome itself is currently '
    + 'withholding the install prompt on this device. '
    + (d.reason === 'chrome-withheld-beforeinstallprompt'
        ? 'This is usually Chrome\'s temporary suppression after a recent dismissal/uninstall of the app; it lifts on later visits. The browser menu (⋮ → Install app) may still work.'
        : 'Reason: ' + d.reason);
  console.warn('[PWA] Native prompt withheld by the browser:', d.reason);
  if (typeof showToast === 'function') showToast(msg, 'info');
}

/**
 * installClick — the ONE centralized CTA handler (V5). Every install
 * surface (App page CTA, legacy in-menu items) routes through this same
 * handler. No duplicate install logic exists.
 *   INSTALLED                     → no-op (CTA hidden anyway)
 *   captured prompt               → REAL native prompt, from this gesture
 *   Chromium, prompt not in hand  → ACTIVE attempt (_awaitLatePrompt):
 *                                   if Chrome supplies the event within the
 *                                   gesture window → REAL native prompt;
 *                                   else truthful withheld reason (§7/§9)
 *   genuinely unsupported browser → honest platform steps (§10)
 */
async function installClick() {
  if (_isAlreadyInstalled()) return; // never prompt when installed
  var prompt = window._pwaInstallPrompt || _state.deferredPrompt;
  if (prompt) { promptInstall(); return; }

  var info = _installBrowserInfo();
  if (!info.nativePromptLikely || info.inAppBrowser) { _noPromptFallback(); return; }

  // Chromium + installable + no captured event YET → active real attempt
  var got = await _awaitLatePrompt();
  if (got) { promptInstall(); return; }

  // Proven-withheld path: diagnostics-backed exact reason (§7)
  await _reportWithheldPrompt();
}

/**
 * installState — THE canonical install state object (V4 §2E/§8). One
 * authoritative answer for "what is the install situation on THIS
 * device/browser right now". All four states stay distinct:
 *   installed / promptAvailable / prompt-not-currently-available / unsupported
 * Never a global "Studyria installed" flag — per-device/browser only.
 */
function installState() {
  var info = _installBrowserInfo();
  var standalone = detectStandalone();
  var installed = _isAlreadyInstalled();
  var promptAvailable = !!(window._pwaInstallPrompt || _state.deferredPrompt);
  var swSupported = 'serviceWorker' in navigator;
  var state = installed ? 'installed'
    : promptAvailable ? 'prompt-available'
    : (info.nativePromptLikely && !info.inAppBrowser && swSupported) ? 'prompt-not-yet-available'
    : swSupported ? 'unsupported-manual'
    : 'unsupported';
  return {
    state: state,
    installed: installed,
    promptAvailable: promptAvailable,
    promptConsumed: _state.installEvents.promptConsumed,
    promptSeen: _state.installEvents.promptSeen,
    promptAt: _state.installEvents.promptAt,
    installedEvent: _state.installEvents.installedEvent,
    unsupported: state === 'unsupported' || state === 'unsupported-manual',
    browser: info.browser,
    platform: info.platform,
    inAppBrowser: info.inAppBrowser,
    standalone: standalone,
    displayMode: (window.matchMedia('(display-mode: standalone)').matches && 'standalone')
      || (window.matchMedia('(display-mode: fullscreen)').matches && 'fullscreen')
      || (window.matchMedia('(display-mode: browser)').matches ? 'browser' : 'unknown'),
    navigatorStandalone: window.navigator.standalone === true,
    swSupported: swSupported,
    listenerMode: window.__pwaEarlyInstallCapture ? 'early-inline' : 'deferred-app-js'
  };
}

/**
 * installDiagnostics — V5 §8 machine-readable runtime diagnosis,
 * production-safe: runs ONLY on demand (console: PWA.installDiagnostics()
 * or automatically after a proven-withheld prompt), exposes no secrets.
 * Verifies every real Chrome installability criterion (fetches the
 * manifest + icons and reads REAL PNG dimensions), then reports the
 * exact reason beforeinstallprompt did or did not arrive.
 */
async function installDiagnostics() {
  var info = _installBrowserInfo();
  var d = {
    version: 5,
    captured: null,          // beforeinstallprompt: captured / not captured
    promptAvailable: null,  // prompt object currently held & unused
    promptConsumed: null,    // prompt() already called on the captured event
    installability: null,    // eligible / ineligible + per-criterion results
    browser: info.browser,
    platform: info.platform,
    displayMode: null,
    appInstalled: null,
    reason: null,           // exact reason
    details: {}
  };

  var details = d.details;
  details.userAgent = navigator.userAgent;
  details.inAppBrowser = info.inAppBrowser;
  details.iframe = (function () { try { return window.top !== window.self; } catch (_) { return true; } })();
  details.protocol = location.protocol;
  details.isSecureContext = window.isSecureContext;
  details.origin = location.origin;
  details.promptSeen = _state.installEvents.promptSeen;
  details.promptAt = _state.installEvents.promptAt;
  details.installedEvent = _state.installEvents.installedEvent;
  details.navigatorStandalone = window.navigator.standalone === true;
  details.documentReferrer = document.referrer || '(empty)';
  details.listenerMode = window.__pwaEarlyInstallCapture ? 'early-inline' : 'deferred-app-js';
  details.eventLog = (window.__pwaInstallLog || []).slice();

  d.displayMode = (window.matchMedia('(display-mode: standalone)').matches && 'standalone')
    || (window.matchMedia('(display-mode: fullscreen)').matches && 'fullscreen')
    || (window.matchMedia('(display-mode: minimal-ui)').matches && 'minimal-ui')
    || (window.matchMedia('(display-mode: browser)').matches ? 'browser' : 'unknown');
  d.appInstalled = _isAlreadyInstalled();
  d.captured = !!(window._pwaInstallPrompt || _state.deferredPrompt) || _state.installEvents.promptSeen;
  d.promptAvailable = !!(window._pwaInstallPrompt || _state.deferredPrompt);
  d.promptConsumed = _state.installEvents.promptConsumed;

  // ── Installability criteria — verified, not assumed (V5 §7) ──
  var criteria = { manifestFetch: false, manifestMime: false, manifestValid: false,
                   iconsDeclared: false, iconsFetchable: false, iconDims: false,
                   https: false, inRealBrowser: false };
  var iconResults = [];

  criteria.https = location.protocol === 'https:' && window.isSecureContext;

  try {
    var r = await fetch('/manifest.json', { cache: 'no-store' });
    criteria.manifestFetch = r.ok;
    var ct = r.headers.get('content-type') || '';
    criteria.manifestMime = /json/.test(ct);
    details.manifestHttp = r.status;
    details.manifestContentType = ct;
    var mf = await r.json();
    criteria.manifestValid = !!(mf.name && mf.short_name && mf.start_url &&
      (mf.display === 'standalone' || mf.display === 'fullscreen' || mf.display === 'minimal-ui' ||
       (mf.display_override || []).some(function (x) { return x === 'standalone' || x === 'fullscreen' || x === 'minimal-ui'; })));
    details.manifest = { name: mf.name || null, short_name: mf.short_name || null,
      id: mf.id || null, start_url: mf.start_url || null, scope: mf.scope || null,
      display: mf.display || null };
    // Chrome requirement: purpose-any icons >=192px AND >=512px declared
    var need = [192, 512], have = {};
    (mf.icons || []).forEach(function (ic) {
      var m = /^(\d+)x(\d+)/.exec(String(ic.sizes || '').trim());
      if (!m) return;
      var purpose = String(ic.purpose === undefined ? 'any' : ic.purpose);
      if (purpose.indexOf('any') === -1) return; // maskable-only doesn't satisfy the any-requirement
      var size = parseInt(m[1], 10);
      need.forEach(function (n) { if (size >= n) have[n] = ic.src; });
    });
    criteria.iconsDeclared = !!(have[192] && have[512]);
    details.iconsDeclared = { any192: have[192] || null, any512: have[512] || null };
    // fetch the declared icons and read REAL pixel dimensions (PNG IHDR)
    var allDimsOk = true;
    for (var ni = 0; ni < need.length; ni++) {
      var n = need[ni];
      if (!have[n]) { allDimsOk = false; continue; }
      try {
        var ir = await fetch(have[n], { cache: 'no-store' });
        var ict = ir.headers.get('content-type') || '';
        var buf = new Uint8Array(await ir.arrayBuffer());
        var isPng = buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
        var w = isPng ? (((buf[16] << 24) >>> 0) | (buf[17] << 16) | (buf[18] << 8) | buf[19]) >>> 0 : 0;
        var ok = ir.ok && /^image\//.test(ict) && w >= n;
        iconResults.push({ size: n, src: have[n], http: ir.status, contentType: ict, realWidth: w, ok: ok });
        if (!ok) allDimsOk = false;
      } catch (e) { iconResults.push({ size: n, src: have[n], error: (e && e.message) }); allDimsOk = false; }
    }
    criteria.iconsFetchable = iconResults.length > 0 && iconResults.every(function (x) { return x.ok; });
    criteria.iconDims = allDimsOk && criteria.iconsDeclared;
    details.iconChecks = iconResults;
  } catch (e) {
    details.manifestHttp = 'fetch-failed: ' + (e && e.message);
  }

  try {
    var reg = await navigator.serviceWorker.getRegistration();
    details.swRegistration = reg ? (reg.active ? 'active' : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'registered') : 'none';
    details.swController = navigator.serviceWorker.controller ? 'controlled' : 'no-controller';
    details.swScope = reg ? reg.scope : null;
    details.swScript = (reg && reg.active) ? reg.active.scriptURL : null;
    // NOTE: Chrome no longer requires a SW for installability — this is
    // reported for completeness, not as an installability gate.
  } catch (e) { details.swRegistration = 'unsupported'; }

  criteria.inRealBrowser = !info.inAppBrowser && !details.iframe;

  d.installability = {
    eligible: criteria.manifestFetch && criteria.manifestMime && criteria.manifestValid &&
              criteria.iconsDeclared && criteria.iconsFetchable && criteria.iconDims &&
              criteria.https && criteria.inRealBrowser,
    criteria: criteria
  };

  // ── Exact reason (V5 §8) ──
  d.reason =
    d.appInstalled ? 'already-installed' :
    d.promptAvailable ? 'prompt-captured-ready' :
    !criteria.inRealBrowser ? (details.iframe ? 'inside-iframe' : 'in-app-browser-or-webview') :
    !info.nativePromptLikely ? 'browser-has-no-native-install-flow:' + info.browser :
    !criteria.https ? 'not-https-or-insecure-context' :
    !criteria.manifestFetch ? 'manifest-fetch-failed' :
    !criteria.manifestMime ? 'manifest-wrong-mime-type' :
    !criteria.manifestValid ? 'manifest-invalid-missing-required-fields' :
    !criteria.iconsDeclared ? 'manifest-missing-192-or-512-any-icons' :
    !criteria.iconsFetchable ? 'install-icons-not-fetchable-or-wrong-mime' :
    !criteria.iconDims ? 'icon-real-dimensions-too-small' :
    'chrome-withheld-beforeinstallprompt';
  // If reason === 'chrome-withheld-beforeinstallprompt' with eligible:true,
  // every app-side criterion passed and the early capture was armed from
  // page start — Chrome itself chose not to dispatch the event. The most
  // common causes are Chrome's suppression heuristics (recent dismissal of
  // the prompt / recent uninstall of the WebAPK / low site engagement).
  // Chrome exposes no API to query this suppression state — this diagnosis
  // is the truthful boundary of what the page can know.

  console.log('[PWA] Install diagnostics (V5):', d);
  return d;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. OFFLINE / ONLINE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function setupNetworkListeners() {
  window.addEventListener('online',  _onOnline);
  window.addEventListener('offline', _onOffline);
  // Apply initial state
  _state.isOnline ? _onOnline() : _onOffline();
}

function _onOnline() {
  _state.isOnline = true;
  document.documentElement.setAttribute('data-online', 'true');
  document.getElementById('_pwaOfflineBar')?.remove();

  // Trigger background sync
  if (_caps.sync && _state.swRegistration) {
    _state.swRegistration.sync.register('sync-data').catch(() => {});
  }

  // Re-load PDFs from Supabase so offline → online transition shows fresh data
  setTimeout(function() {
    if (typeof window.renderLibGrid === 'function') window.renderLibGrid();
    if (typeof window.loadActivityBarStats === 'function') window.loadActivityBarStats();
    if (typeof window.loadSupabaseHomeStats === 'function') window.loadSupabaseHomeStats();
  }, 1200);

  if (typeof showToast === 'function') {
    showToast('📶 You\'re back online!', 'success');
  }

  window.dispatchEvent(new CustomEvent('pwa:online', { detail: { ts: Date.now() } }));
}

function _onOffline() {
  _state.isOnline = false;
  document.documentElement.setAttribute('data-online', 'false');

  if (!document.getElementById('_pwaOfflineBar')) {
    const cachedCount = (window.PDFS || []).length;
    const bar = document.createElement('div');
    bar.id = '_pwaOfflineBar';
    bar.setAttribute('role', 'status');
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
      'background:var(--theme-error-bg, #7f1d1d)',
      'border-bottom:1px solid var(--theme-error-border, transparent)',
      'padding:10px 16px', 'display:flex', 'align-items:center', 'gap:8px',
      'font-family:var(--hp-font-body, system-ui, sans-serif)',
      'font-size:.85rem', 'color:var(--theme-error, #fecaca)',
      'box-shadow:var(--theme-shadow, 0 2px 12px rgba(0,0,0,0.5))',
    ].join(';');
    bar.innerHTML = `
      <span style="width:8px;height:8px;background:var(--theme-error, #ef4444);border-radius:50%;flex-shrink:0;animation:_pwaPulse 2s ease-in-out infinite"></span>
      <span style="flex:1">📡 You're offline${cachedCount > 0 ? ` — ${cachedCount} PDFs cached` : ' — some features may be unavailable'}</span>
      <button onclick="window.location.reload()" style="padding:4px 10px;background:var(--theme-surface-elevated);color:var(--theme-error);border:1px solid var(--theme-error-border);border-radius:6px;font-size:.75rem;cursor:pointer;flex-shrink:0">Retry</button>
    `;

    if (!document.getElementById('_pwaAnimStyles')) {
      const style = document.createElement('style');
      style.id = '_pwaAnimStyles';
      style.textContent = `
        @keyframes _pwaSlideUp {
          from { opacity:0; transform:translateX(-50%) translateY(24px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }
        @keyframes _pwaPulse {
          0%,100% { opacity:1; }
          50% { opacity:.4; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.insertAdjacentElement('afterbegin', bar);
  }

  window.dispatchEvent(new CustomEvent('pwa:offline', { detail: { ts: Date.now() } }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function cleanupOldCaches() {
  try {
    const keys    = await caches.keys();
    const toDelete = keys.filter(k => k.startsWith('studyria-') && k !== PWA_CONFIG.CACHE_NAME);
    await Promise.all(toDelete.map(k => caches.delete(k)));
    if (toDelete.length) console.log('[PWA] Old caches deleted:', toDelete);
  } catch (e) {
    console.warn('[PWA] Cache cleanup failed:', e);
  }
}

async function clearAllCaches() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('studyria-')).map(k => caches.delete(k)));
    console.log('[PWA] All Studyria caches cleared');
  } catch (e) {
    console.warn('[PWA] clearAllCaches failed:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. BACKGROUND SYNC
// ═══════════════════════════════════════════════════════════════════════════

async function registerBackgroundSync(tag = 'sync-data') {
  try {
    if (!_caps.sync || !_state.swRegistration) {
      console.warn('[PWA] Background Sync not supported or SW not ready');
      return false;
    }
    await _state.swRegistration.sync.register(tag);
    console.log('[PWA] Background sync registered:', tag);
    return true;
  } catch (e) {
    console.warn('[PWA] registerBackgroundSync failed:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. ONESIGNAL WEB PUSH
// ═══════════════════════════════════════════════════════════════════════════
//
// Strategy:
//   • The OneSignal page SDK (<script defer>) and the deferred queue
//     (window.OneSignalDeferred) are both added by index.html — this file
//     must never touch those.
//   • We push a single callback into OneSignalDeferred.  OneSignal runs it
//     once the SDK is ready, which may be before or after DOMContentLoaded.
//   • init() is called exactly once thanks to _osState.initialized.
//   • No permission prompt fires on page load (autoPrompt: false).
//   • All public helpers are exposed on window.StudyriaNotifications.

const _osState = {
  initialized:  false,   // true after OneSignal.init() resolves
  initPromise:  null,    // the init Promise, so concurrent callers can await it
};

/**
 * _initOneSignal — called from inside window.OneSignalDeferred.
 * Runs once the SDK is ready; safe to call multiple times (idempotent).
 */
async function _initOneSignal(OneSignal) {
  // Guard: never init twice
  if (_osState.initialized) return;

  // If a concurrent call has already started init, wait for it
  if (_osState.initPromise) {
    await _osState.initPromise;
    return;
  }

  _osState.initPromise = (async () => {
    try {
      await OneSignal.init({
        appId:         '12e09fd8-9362-49ef-87d9-14ba353db7a6',
        safari_web_id: 'web.onesignal.auto.613528e9-2930-4b07-a098-5a9518822d98',
        notifyButton:  { enable: false },
        promptOptions: { autoPrompt: false },
      });

      _osState.initialized = true;
      console.log('[OneSignal] Initialized ✅');

      // Listen for future subscription changes (user opts in/out)
      OneSignal.User.PushSubscription.addEventListener('change', function(event) {
        console.log('[OneSignal] Subscription changed →',
          'optedIn:', event.current.optedIn,
          'id:', event.current.id || '—'
        );
        window.dispatchEvent(new CustomEvent('onesignal:subscriptionchange', {
          detail: {
            optedIn: event.current.optedIn,
            id:      event.current.id || null,
          }
        }));
      });

    } catch (err) {
      console.warn('[OneSignal] Init failed — push notifications unavailable:', err);
      // Do not rethrow: a OneSignal failure must never break the page.
    }
  })();

  await _osState.initPromise;
}

// Push the init callback into the deferred queue.
// If the SDK loaded before this line runs, OneSignal processes the queue
// synchronously on the next microtask; if not, it processes it once the SDK
// script finishes loading.  Either way, _initOneSignal receives the SDK
// instance as its first argument.
window.OneSignalDeferred = window.OneSignalDeferred || [];
// [Studyria Push Migration] OneSignal retired — native VAPID Web Push
// (SN.push, studyria-notifications.js) now owns the permission flow.
// OneSignal init intentionally disabled to prevent duplicate push systems.
// window.OneSignalDeferred.push(_initOneSignal);

// ── Helper: wait until init is complete ─────────────────────────────────────

/**
 * _waitForOneSignal — resolves once OneSignal.init() has completed.
 * Rejects after a 15-second timeout so callers never hang.
 */
function _waitForOneSignal() {
  return new Promise(function(resolve, reject) {
    if (_osState.initialized) { resolve(); return; }

    var deadline = Date.now() + 15000;

    function poll() {
      if (_osState.initialized) { resolve(); return; }
      if (Date.now() >= deadline) { reject(new Error('OneSignal init timed out')); return; }
      setTimeout(poll, 200);
    }
    poll();
  });
}

// ── Public helpers ───────────────────────────────────────────────────────────

/**
 * isNotificationSupported — true when the browser has everything needed for
 * push notifications (Notification API + Service Worker + PushManager +
 * secure context).  This is the canonical check used by all Notification
 * Center UI paths; it never falls back to UA sniffing.
 *
 * Android Chrome passes all four conditions once the Service Worker is
 * registered and the page is served over HTTPS (or localhost).
 */
function isNotificationSupported() {
  return (
    'Notification'    in window &&
    'serviceWorker'   in navigator &&
    'PushManager'     in window &&
    window.isSecureContext === true
  );
}

/**
 * isSubscribed — resolves to true when the user is currently opted in.
 * Returns false (not throws) if OneSignal is unavailable.
 */
async function isSubscribed() {
  try {
    await _waitForOneSignal();
    return !!window.OneSignal?.User?.PushSubscription?.optedIn;
  } catch (_) {
    return false;
  }
}

/**
 * getSubscriptionId — resolves to the OneSignal subscription ID string,
 * or null if the user is not subscribed or OneSignal is unavailable.
 */
async function getSubscriptionId() {
  try {
    await _waitForOneSignal();
    return window.OneSignal?.User?.PushSubscription?.id || null;
  } catch (_) {
    return null;
  }
}

/**
 * requestNotificationPermission — the single entry-point for requesting push
 * permission.  Call this from a user-gesture handler (button click, etc.).
 *
 * Returns:
 *   { success: true,  subscriptionId: '<id>' }   — user opted in
 *   { success: false, reason: '<why>' }           — denied, error, unsupported
 *
 * Guarantees:
 *   • Waits for OneSignal.init() before requesting — never races with init.
 *   • Never triggers a duplicate permission prompt.
 *   • Never throws — all errors are returned as { success: false }.
 */
async function requestNotificationPermission() {
  if (!isNotificationSupported()) {
    return { success: false, reason: 'not_supported' };
  }

  // Already denied by the browser — requesting again would be silently ignored
  // and would mislead the caller into thinking a prompt appeared.
  if (Notification.permission === 'denied') {
    console.warn('[OneSignal] Notification permission already denied by browser.');
    return { success: false, reason: 'denied' };
  }

  try {
    await _waitForOneSignal();
  } catch (err) {
    console.warn('[OneSignal] requestNotificationPermission: SDK not ready —', err.message);
    return { success: false, reason: 'sdk_not_ready' };
  }

  // Already subscribed — return immediately without showing a duplicate prompt
  if (window.OneSignal?.User?.PushSubscription?.optedIn) {
    return {
      success:        true,
      subscriptionId: window.OneSignal.User.PushSubscription.id || null,
    };
  }

  try {
    await window.OneSignal.Notifications.requestPermission();

    const optedIn = !!window.OneSignal?.User?.PushSubscription?.optedIn;
    if (optedIn) {
      return {
        success:        true,
        subscriptionId: window.OneSignal.User.PushSubscription.id || null,
      };
    }
    return { success: false, reason: 'dismissed' };

  } catch (err) {
    console.warn('[OneSignal] requestPermission error:', err);
    return { success: false, reason: err.message || 'error' };
  }
}

/**
 * getPermissionState — returns the current notification support/permission
 * state for building Notification Center UI without calling requestPermission():
 *
 *   'unsupported' — browser lacks Notification / SW / PushManager / secure ctx
 *   'default'     — supported, user hasn't been asked yet  → show Enable button
 *   'granted'     — permission granted                     → show "Enabled" status
 *   'denied'      — permission denied                      → show "Open Browser Settings"
 *
 * Never returns 'unsupported' on Android Chrome when SW is registered and
 * the page is served over HTTPS.
 */
async function getPermissionState() {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/**
 * renderNotificationCenterUI — updates a Notification Center container with
 * the correct button/label for the current permission state.
 *
 * Expected DOM inside `container`:
 *   .notif-unsupported  — shown only when truly unsupported
 *   .notif-enable-btn   — "Enable Notifications" button (default state)
 *   .notif-enabled-msg  — "Notifications Enabled" label (granted state)
 *   .notif-settings-btn — "Open Browser Settings" button (denied state)
 *
 * Call this on page load and after any permission change.
 *
 * @param {Element} container  — wrapper element containing the four UI nodes
 */
async function renderNotificationCenterUI(container) {
  if (!container) return;

  const unsupportedEl = container.querySelector('.notif-unsupported');
  const enableBtn     = container.querySelector('.notif-enable-btn');
  const enabledMsg    = container.querySelector('.notif-enabled-msg');
  const settingsBtn   = container.querySelector('.notif-settings-btn');

  // Helper: hide all, then reveal one
  function _show(el) {
    [unsupportedEl, enableBtn, enabledMsg, settingsBtn].forEach(function(n) {
      if (n) n.style.display = 'none';
    });
    if (el) el.style.display = '';
  }

  const state = await getPermissionState();

  if (state === 'unsupported') {
    _show(unsupportedEl);
    return;
  }

  if (state === 'granted') {
    _show(enabledMsg);
    return;
  }

  if (state === 'denied') {
    _show(settingsBtn);
    // Wire up click to best-effort settings deep-link
    if (settingsBtn && !settingsBtn.__notifSettingsBound) {
      settingsBtn.__notifSettingsBound = true;
      settingsBtn.addEventListener('click', function() {
        openNotificationSettings();
      });
    }
    return;
  }

  // state === 'default'
  _show(enableBtn);
  if (enableBtn && !enableBtn.__notifEnableBound) {
    enableBtn.__notifEnableBound = true;
    enableBtn.addEventListener('click', async function() {
      enableBtn.disabled = true;
      try {
        const result = await requestNotificationPermission();
        // Re-render after the prompt resolves
        await renderNotificationCenterUI(container);
      } catch (_) {
        enableBtn.disabled = false;
      }
    });
  }
}

/**
 * openNotificationSettings — best-effort attempt to surface the browser's
 * site settings UI so the user can re-enable notifications after denying.
 * No browser exposes a direct JS API for this, so we:
 *   1. On Chrome/Edge/Android, deep-link to the relevant settings page where
 *      supported via chrome://settings (only works if already in that
 *      context — most mobile browsers ignore it, so this is paired with
 *      on-screen instructions in the Notification Center UI).
 *   2. Otherwise, just return false so the caller can show manual steps.
 */
function openNotificationSettings() {
  try {
    const ua = navigator.userAgent || '';
    const isChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua);
    if (isChrome) {
      // This only succeeds when the page itself is a chrome:// page, which
      // it never is for a normal site — included for completeness, but the
      // realistic path is always the manual-instructions fallback below.
      window.open('chrome://settings/content/notifications', '_blank');
      return true;
    }
  } catch (_) { /* ignore */ }
  return false;
}

/**
 * tagAudienceSegment — tags the current OneSignal subscriber with a
 * 'user_type' of 'premium' or 'free' so admin sends can target audiences
 * via OneSignal segments/filters server-side. Call this after login and
 * after any purchase completes. Safe no-op if OneSignal isn't ready.
 *
 * NOTE: Studyria has no dedicated "is_premium" column today — this uses
 * "has at least one purchased PDF" as the premium signal. Adjust the
 * `isPremium` argument at the call site if a real premium/subscription
 * flag is added later.
 */
async function tagAudienceSegment(isPremium) {
  try {
    await _waitForOneSignal();
    await window.OneSignal?.User?.addTag?.('user_type', isPremium ? 'premium' : 'free');
  } catch (_) { /* OneSignal unavailable — never throw */ }
}

// ── Public surface ───────────────────────────────────────────────────────────

/**
 * window.StudyriaNotifications — the stable public API for all OneSignal
 * interactions.  Other scripts (inline or third-party) should use this
 * rather than calling OneSignal directly.
 */
window.StudyriaNotifications = {
  // [Studyria Push Migration] Engine swapped OneSignal → native VAPID
  // Web Push (SN.push). UI shell unchanged; behavior identical to callers.
  requestPermission: async function () {
    if (window.SN && SN.push) return SN.push.enable();
    return { success: false, reason: 'unsupported' };
  },
  isSubscribed: async function () {
    if (window.SN && SN.push) {
      const st = await SN.push.status();
      return !!st.subscribed;
    }
    return false;
  },
  getSubscriptionId: async function () {
    if (window.SN && SN.push) {
      const st = await SN.push.status();
      return st.subscribed ? 'device-subscribed' : null;
    }
    return null;
  },
  getPermissionState: async function () {
    if (window.SN && SN.push) {
      if (!SN.push.supported()) return 'unsupported';
      return Notification.permission; // 'default' | 'granted' | 'denied'
    }
    return 'unsupported';
  },
  renderNotificationCenterUI: renderNotificationCenterUI,
  openNotificationSettings: openNotificationSettings,
  tagAudienceSegment:       async function () { /* retired with OneSignal */ },
};

console.log('[OneSignal] window.StudyriaNotifications ready');

// ═══════════════════════════════════════════════════════════════════════════
// 10. DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════

function getDiagnostics() {
  const reg = _state.swRegistration;
  return {
    pwa: {
      name:        PWA_CONFIG.NAME,
      version:     PWA_CONFIG.VERSION,
      cacheName:   PWA_CONFIG.CACHE_NAME,
      initialized: _state.initialized,
    },
    capabilities: {
      serviceWorkers: _caps.sw,
      backgroundSync: _caps.sync,
      periodicSync:   _caps.periodicSync,
      pushManager:    _caps.pushManager,
    },
    state: {
      isOnline:            _state.isOnline,
      isInstalled:         _state.isInstalled,
      hasPendingUpdate:    !!(_state.waitingSW || reg?.waiting),
      swState:             reg?.active?.state || 'none',
    },
    metrics: {
      ..._metrics,
      hitRate: (_metrics.cacheHits + _metrics.cacheMisses) > 0
        ? ((_metrics.cacheHits / (_metrics.cacheHits + _metrics.cacheMisses)) * 100).toFixed(1) + '%'
        : 'N/A',
    },
    data: {
      pdfsLoaded:       (window.PDFS || []).length,
      supabaseReady:    !!window.supabaseClient,
      currentPage:      window.currentPage || '—',
      oneSignalInited:  _osState.initialized,
    },
    browser: {
      userAgent:           navigator.userAgent,
      language:            navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency || 'N/A',
      deviceMemory:        navigator.deviceMemory        || 'N/A',
      onLine:              navigator.onLine,
    },
  };
}

function getPerformanceMetrics() {
  // Use modern Navigation Timing API v2 where available
  const entries = performance.getEntriesByType?.('navigation');
  if (entries?.length) {
    const nav = entries[0];
    return {
      dns:            nav.domainLookupEnd - nav.domainLookupStart,
      tcp:            nav.connectEnd      - nav.connectStart,
      ttfb:           nav.responseStart   - nav.requestStart,
      download:       nav.responseEnd     - nav.responseStart,
      domInteractive: nav.domInteractive  - nav.fetchStart,
      domComplete:    nav.domComplete     - nav.fetchStart,
      loadComplete:   nav.loadEventEnd    - nav.fetchStart,
      type:           nav.type,
    };
  }
  // Fallback: legacy timing API
  const t = performance.timing;
  if (!t) return null;
  return {
    dns:            t.domainLookupEnd - t.domainLookupStart,
    tcp:            t.connectEnd      - t.connectStart,
    ttfb:           t.responseStart   - t.requestStart,
    download:       t.responseEnd     - t.responseStart,
    domInteractive: t.domInteractive  - t.fetchStart,
    domComplete:    t.domComplete     - t.fetchStart,
    loadComplete:   t.loadEventEnd    - t.fetchStart,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. MAIN INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

async function initPWA() {
  if (_state.initialized) return;
  _state.initialized = true;

  checkInstalledState();
  setupInstallPrompt();      // registers beforeinstallprompt + appinstalled once
  setupNetworkListeners();

  // If already installed on load, hide the install button immediately
  if (_isAlreadyInstalled()) {
    _markBurgerInstalled();
  }

  // Also run after DOM is ready in case button isn't rendered yet
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      if (_isAlreadyInstalled()) _markBurgerInstalled();
      else _updateInstallButtonVisibility();
    });
  }

  // Register SW after load to avoid delaying first paint
  if (document.readyState === 'complete') {
    await registerServiceWorker();
    cleanupOldCaches();
  } else {
    window.addEventListener('load', async () => {
      await registerServiceWorker();
      cleanupOldCaches();
    });
  }

  console.log('[PWA] Studyria PWA v' + PWA_CONFIG.VERSION + ' initialized ✅');
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPWA);
} else {
  initPWA();
}

// ═══════════════════════════════════════════════════════════════════════════
// 12. PUBLIC API  (window.PWA)
// ═══════════════════════════════════════════════════════════════════════════

window.PWA = {
  VERSION: PWA_CONFIG.VERSION,

  // State queries
  isOnline:        () => _state.isOnline,
  isInstalled:     () => _isAlreadyInstalled(),
  hasPendingUpdate:() => !!(_state.waitingSW || _state.swRegistration?.waiting),

  // Update management
  checkForUpdates,
  applyUpdate,
  showRestartBanner,

  // Install
  promptInstall,
  installClick,
  installState,
  installDiagnostics,
  markBurgerInstalled: _markBurgerInstalled,
  showiOSInstallTip,
  showInstallHelp,
  dismissInstallBanner,
  updateInstallButtonVisibility: _updateInstallButtonVisibility,

  // Cache
  cleanupOldCaches,
  clearAllCaches,

  // Sync
  registerBackgroundSync,

  // Diagnostics
  getDiagnostics,
  getPerformanceMetrics,
  logDiagnostics: () => {
    const d = getDiagnostics();
    console.group('[PWA] Diagnostics');
    console.table(d.state);
    console.table(d.capabilities);
    console.table(d.metrics);
    console.groupEnd();
    return d;
  },
};

console.log('[PWA] window.PWA ready — use window.PWA.logDiagnostics() to inspect');
