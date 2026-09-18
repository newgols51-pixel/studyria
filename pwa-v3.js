// ══════════════════════════════════════════════════════════════════
// pwa-v3.js — Studyria PWA V3 (2026)
// ══════════════════════════════════════════════════════════════════
// Handles:
//   • Animated splash screen (60fps GPU-accelerated)
//   • Upgrade notification banner (beautiful, one-click update)
//   • Online/offline status indicator
//   • Install success animation + badge
//   • Periodic background sync registration
//   • Launch handler (navigate-existing)
//   • Install analytics
//   • Prefetch on idle
//   • Network status monitoring
//   • Version check on focus
// ══════════════════════════════════════════════════════════════════
;(function() {
  'use strict';

  // ── CONFIG ────────────────────────────────────────────────────
  const CFG = {
    splashDuration:    2200,   // ms total splash display (static fallback splash)
    splashFadeOut:     400,   // ms fade-out
    splashVideoHardCapMs: 4500, // V4: absolute max time the video splash may stay up
    splashVideoReadyMs:  1200, // V4: video must reach readyState>=2 by now, else static fallback
    updateCheckDelay:  30000,  // ms after load before first update check
    prefetchDelay:     5000,   // ms after load before prefetch runs
    networkBarDuration:3000,   // ms to show "Back online" bar
  };

  // ── SPLASH SCREEN ─────────────────────────────────────────────
  function initSplash() {
    // Only show splash on standalone (installed) launch or first visit
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                      || window.matchMedia('(display-mode: fullscreen)').matches
                      || window.matchMedia('(display-mode: minimal-ui)').matches
                      || window.navigator.standalone === true;
    const splashKey = 'studyria_splash_shown_v3';
    const lastShown = parseInt(sessionStorage.getItem(splashKey) || '0', 10);
    const now       = Date.now();

    // Show splash if: standalone, OR hasn't been shown this session
    if (!isStandalone && lastShown && (now - lastShown < 300000)) return;
    sessionStorage.setItem(splashKey, String(now));

    const splash = document.getElementById('pwaV3Splash');
    if (!splash) return;

    // V5 boot-order fix: tell the early inline failsafe (index.html,
    // right after the splash markup) that this real script IS running —
    // its own redundant hard-cap timer becomes a no-op from here on.
    window.__pwaSplashJsActive = true;

    if (isStandalone) {
      // pwa-v3.css already painted the splash at display:flex /
      // opacity:1 via the display-mode media query BEFORE this
      // (deferred) script ever ran — that IS the boot-order fix.
      // Re-doing the opacity 0→1 fade-in here would dip an already-
      // visible splash back to invisible for a frame, undoing it.
      // Just make sure inline styles agree with the stylesheet.
      splash.style.display = 'flex';
      splash.style.opacity = '1';
    } else {
      // Browser-tab / session-gated first-visit path — unchanged (V4).
      splash.style.display = 'flex';
      splash.style.opacity = '0';
      requestAnimationFrame(() => {
        splash.style.transition = 'opacity 0.3s ease';
        splash.style.opacity = '1';
      });
    }

    // ── V4 (2026-09-18): official 4s Studyria animation video ──
    // Video mode when the official splash video can play here and the
    // user hasn't asked for reduced motion. Every path ends at the
    // existing static splash or a direct fade-out — the user can never
    // be trapped. The website keeps initializing behind the overlay.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const video   = document.getElementById('pwaSplashVideo');

    if (!reduced && video) {
      tryVideoSplash(splash, video);
      return;
    }

    runStaticSplash(splash);
  }

  // ── Shared fade-out (used by both splash modes) ─────────────────
  function fadeOutSplash(splash) {
    splash.style.transition = 'opacity ' + (CFG.splashFadeOut / 1000) + 's ease';
    splash.style.opacity    = '0';
    setTimeout(() => {
      splash.style.display = 'none';
      splash.setAttribute('aria-hidden', 'true');
    }, CFG.splashFadeOut);
  }

  // ── Static (pre-V4) splash timeline ─────────────────────────────
  function runStaticSplash(splash) {
    setTimeout(() => {
      // Trigger loading animation complete
      const ring = splash.querySelector('.pwa-splash-ring');
      if (ring) ring.classList.add('pwa-splash-ring--done');
    }, CFG.splashDuration - 600);

    setTimeout(() => fadeOutSplash(splash), CFG.splashDuration);
  }

  // ── V4 official video splash ────────────────────────────────────
  // The video (autoplay muted playsinline, 1080x1920, ~4.0s) plays
  // full-viewport with object-fit:contain over the existing splash
  // layer. Exit paths, whichever fires FIRST:
  //   1. video 'ended'  → fade out (~4.0s)
  //   2. hard cap timer → fade out (4.5s, never traps the user)
  //   3. video error / autoplay refused / not ready in 1.2s
  //      → seamless switch to the existing static splash (2.2s)
  function tryVideoSplash(splash, video) {
    let done = false;               // one-shot guard for every exit path

    const finish = () => {          // exit: fade out, site becomes interactive
      if (done) return;
      done = true;
      clearTimeout(hardTimer);
      clearTimeout(readyTimer);
      video.removeEventListener('error', onVideoFailed);
      video.removeEventListener('ended', finish);
      try { video.pause(); } catch (_) {}
      splash.classList.remove('pwa-splash--video');
      fadeOutSplash(splash);
    };

    const onVideoFailed = () => {   // fallback: existing static splash
      if (done) return;
      clearTimeout(readyTimer);
      video.removeEventListener('ended', finish);
      video.removeEventListener('error', onVideoFailed);
      try { video.pause(); } catch (_) {}
      splash.classList.remove('pwa-splash--video'); // static logo markup shows
      runStaticSplash(splash);
      // hardTimer stays armed: static path must also never trap anyone
    };

    // Safety nets — armed BEFORE play() so no race can leave them off
    const hardTimer  = setTimeout(finish, CFG.splashVideoHardCapMs);
    const readyTimer = setTimeout(() => {
      if (!done && (video.readyState < 2 || video.paused)) onVideoFailed();
    }, CFG.splashVideoReadyMs);

    video.addEventListener('error', onVideoFailed, { once: true });
    video.addEventListener('ended', finish, { once: true });

    splash.classList.add('pwa-splash--video');
    const p = video.play();
    if (p && p.catch) p.catch(onVideoFailed);
  }

  // ── UPDATE BANNER ─────────────────────────────────────────────
  function showUpdateBanner(swReg) {
    let banner = document.getElementById('pwaV3UpdateBanner');
    if (!banner) {
      banner = createUpdateBanner();
      document.body.appendChild(banner);
    }
    banner.classList.add('pwa-update-banner--visible');

    const btn = banner.querySelector('.pwa-update-btn');
    const dismiss = banner.querySelector('.pwa-update-dismiss');

    if (btn) {
      btn.onclick = function() {
        btn.textContent = 'Updating…';
        btn.disabled = true;
        if (swReg && swReg.waiting) {
          swReg.waiting.postMessage({ type: 'SKIP_WAITING' });
          navigator.serviceWorker.addEventListener('controllerchange', function onCC() {
            navigator.serviceWorker.removeEventListener('controllerchange', onCC);
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
      };
    }

    if (dismiss) {
      dismiss.onclick = function() {
        banner.classList.remove('pwa-update-banner--visible');
      };
    }
  }

  function createUpdateBanner() {
    const el = document.createElement('div');
    el.id = 'pwaV3UpdateBanner';
    el.className = 'pwa-update-banner';
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <div class="pwa-update-inner">
        <div class="pwa-update-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div class="pwa-update-text">
          <span class="pwa-update-title">New version available!</span>
          <span class="pwa-update-sub">Update now for the latest features</span>
        </div>
        <button class="pwa-update-btn">Update Now</button>
        <button class="pwa-update-dismiss" aria-label="Dismiss">✕</button>
      </div>
    `;
    return el;
  }

  // ── NETWORK STATUS INDICATOR ──────────────────────────────────
  function initNetworkMonitor() {
    let bar = document.getElementById('pwaV3NetBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pwaV3NetBar';
      bar.className = 'pwa-net-bar';
      document.body.appendChild(bar);
    }

    let _timer = null;

    function showOffline() {
      bar.textContent = '⚡ You\'re offline — cached content available';
      bar.className   = 'pwa-net-bar pwa-net-bar--offline pwa-net-bar--visible';
      if (_timer) { clearTimeout(_timer); _timer = null; }
    }

    function showOnline() {
      bar.textContent = '✓ Back online!';
      bar.className   = 'pwa-net-bar pwa-net-bar--online pwa-net-bar--visible';
      _timer = setTimeout(() => {
        bar.classList.remove('pwa-net-bar--visible');
      }, CFG.networkBarDuration);
    }

    window.addEventListener('online',  showOnline);
    window.addEventListener('offline', showOffline);

    // Initial state
    if (!navigator.onLine) showOffline();
  }

  // ── INSTALL SUCCESS ANIMATION ─────────────────────────────────
  function handleInstallSuccess() {
    // Hide install cards, show installed badge
    const installCards = document.querySelectorAll('[id*="InstallCard"], .pwa-install-card');
    installCards.forEach(el => {
      if (!el.id.toLowerCase().includes('installed')) {
        el.style.display = 'none';
      }
    });
    const installedCards = document.querySelectorAll('[id*="InstalledCard"]');
    installedCards.forEach(el => { el.style.display = ''; });

    // Fire install confetti particle
    _confettiBurst();

    // Track install event
    try {
      if (window.gtag) gtag('event', 'pwa_install', { event_category: 'PWA' });
      if (window.dataLayer) dataLayer.push({ event: 'pwa_install' });
    } catch (_) {}
  }

  function _confettiBurst() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
    document.body.appendChild(canvas);
    const ctx    = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height= window.innerHeight;

    const COLORS = ['#930205','#fbbf24','#10b981','#f43f5e','#8b5cf6','#06b6d4'];
    const particles = Array.from({ length: 80 }, (_, i) => ({
      x: canvas.width / 2,
      y: canvas.height * 0.4,
      vx: (Math.random() - 0.5) * 18,
      vy: (Math.random() - 2)   * 14,
      r:  Math.random() * 6 + 3,
      color: COLORS[i % COLORS.length],
      alpha: 1,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.3,
    }));

    let frame;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach(p => {
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += 0.5;
        p.vx *= 0.97;
        p.alpha -= 0.018;
        p.rot += p.rotV;
        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle   = p.color;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
          ctx.restore();
        }
      });
      if (alive) { frame = requestAnimationFrame(draw); }
      else { cancelAnimationFrame(frame); document.body.removeChild(canvas); }
    }
    frame = requestAnimationFrame(draw);
  }

  // ── PERIODIC SYNC REGISTRATION ────────────────────────────────
  async function registerPeriodicSync(reg) {
    if (!('periodicSync' in reg)) return;
    try {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await reg.periodicSync.register('studyria-content-refresh', {
          minInterval: 12 * 60 * 60 * 1000 // 12 hours
        });
        console.log('[PWA V3] Periodic sync registered ✅');
      }
    } catch (e) {
      console.log('[PWA V3] Periodic sync not available:', e.message);
    }
  }

  // ── PREFETCH ON IDLE ──────────────────────────────────────────
  function prefetchOnIdle(reg) {
    const urls = ['/offline.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];
    const run = () => {
      if (reg && reg.active) {
        reg.active.postMessage({ type: 'PREFETCH_URLS', urls });
      }
    };
    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 10000 });
    } else {
      setTimeout(run, CFG.prefetchDelay);
    }
  }

  // ── VERSION CHECK ON FOCUS ────────────────────────────────────
  function initVersionCheckOnFocus(reg) {
    let lastFocus = Date.now();
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState !== 'visible') return;
      const elapsed = Date.now() - lastFocus;
      lastFocus = Date.now();
      // Only check if tab was hidden for more than 10 min
      if (elapsed > 600000 && reg) {
        reg.update().catch(() => {});
      }
    });
  }

  // ── SW CONTROLLER CHANGE (auto-reload on update) ───────────────
  function listenForControllerChange() {
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
      // The update was applied — a reload will pick up the new version
      // Only reload if the page isn't in the middle of a purchase flow
      const safeToReload = !document.querySelector('[data-payment-active]')
                        && !window._razorpayOpen;
      if (safeToReload) window.location.reload();
    });
  }

  // ── MAIN INIT ─────────────────────────────────────────────────
  function init() {
    // 1. Splash
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSplash, { once: true });
    } else {
      initSplash();
    }

    // 2. Network monitor
    initNetworkMonitor();

    // 3. SW integration
    if (!('serviceWorker' in navigator)) return;

    // Listen for SW messages
    navigator.serviceWorker.addEventListener('message', function(event) {
      const { type } = event.data || {};
      if (type === 'CONTENT_REFRESHED') {
        console.log('[PWA V3] Content refreshed in background');
      }
      if (type === 'SYNC_FIRED') {
        console.log('[PWA V3] Background sync fired:', event.data.tag);
      }
    });

    // Hook into app.js PWA object (it registers the SW)
    // We observe after SW is registered
    function onSWReady(reg) {
      console.log('[PWA V3] SW ready ✅', reg.active ? reg.active.state : 'no active');

      // Periodic sync
      registerPeriodicSync(reg);

      // Prefetch
      prefetchOnIdle(reg);

      // Version check on focus
      initVersionCheckOnFocus(reg);

      // Update found handler
      reg.addEventListener('updatefound', function() {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', function() {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[PWA V3] New SW installed and waiting — showing update banner');
            showUpdateBanner(reg);
          }
        });
      });

      // If a SW is already waiting on load (e.g. tab was in bg during update)
      if (reg.waiting) {
        showUpdateBanner(reg);
      }
    }

    // Wait for app.js to register SW, then hook in
    function pollForSWReg() {
      if (window.PWA && window.PWA.getRegistration) {
        const reg = window.PWA.getRegistration();
        if (reg) { onSWReady(reg); return; }
      }
      // Fallback: use navigator.serviceWorker.ready
      navigator.serviceWorker.ready.then(onSWReady).catch(() => {});
    }

    // app.js emits 'pwa:registered' — catch that or poll
    window.addEventListener('pwa:registered', function(e) {
      if (e.detail && e.detail.registration) onSWReady(e.detail.registration);
    }, { once: true });

    // Poll after short delay in case event already fired
    setTimeout(pollForSWReg, 2000);

    // 4. Install success
    window.addEventListener('appinstalled', function() {
      console.log('[PWA V3] App installed ✅');
      handleInstallSuccess();
    });

    // 5. Controller change
    listenForControllerChange();

    // 6. Launch handler (navigate-existing)
    if ('launchQueue' in window && 'LaunchParams' in window) {
      window.launchQueue.setConsumer(function(params) {
        if (params.targetURL) {
          const url = new URL(params.targetURL);
          const hash = url.hash || url.searchParams.get('page');
          if (hash && window.navigate) {
            navigate(hash.replace('#', '') || 'home');
          }
        }
      });
    }
  }

  // ── EXPOSE GLOBALS ────────────────────────────────────────────
  window.pwaV3 = {
    showUpdateBanner,
    handleInstallSuccess,
  };

  // ── BOOT ──────────────────────────────────────────────────────
  init();

})();
