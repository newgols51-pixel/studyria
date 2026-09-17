/* ══════════════════════════════════════════════════════════════════
   admin-pwa.js — Studyria Admin PWA identity + install experience
   ─────────────────────────────────────────────────────────────────
   • Registers admin-sw.js under scope './' (admin app only — never the
     public site).
   • Install CTA appears ONLY inside the authorized Admin Console
     (never on the login page, never on the public site).
   • Real browser install mechanism (beforeinstallprompt) where
     supported; honest platform-aware instructions otherwise.
     NEVER fakes installed/unsupported status.
   • Logout hardening: wipes the rendered console DOM so no protected
     admin content remains in the page after logout/sign-out.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── 1. Service worker (Admin-scoped) ──────────────────────────────
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('admin-sw.js', { scope: './' }).catch(function (err) {
      console.warn('[admin-pwa] SW registration failed:', err);
    });
  }

  // ── 2. Install state (real signals only) ─────────────────────────
  var deferredPrompt = null;
  var _wasInstalledToastShown = false;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches
      || window.navigator.standalone === true;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    renderInstallButton();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    renderInstallButton();
    if (typeof showToast === 'function') showToast('Studyria Admin installed! 🎉', 'success');
  });

  // ── 3. Install CTA (console topbar only) ─────────────────────────
  function platform() {
    var ua = navigator.userAgent;
    if (/android/i.test(ua)) return 'android';
    if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    return 'desktop';
  }

  function helpModalBody() {
    var p = platform();
    if (p === 'ios') return 'iOS does not support automatic install prompts.<br><br>Open this page in <b>Safari</b>, tap the <b>Share</b> button, then choose <b>“Add to Home Screen”</b>.';
    if (p === 'android') return 'Open the browser menu (<b>⋮</b>) and tap <b>“Install app”</b> — or accept the install banner when Chrome shows it.';
    return 'Open the browser menu and look for <b>“Install Studyria Admin…”</b> (Chrome/Edge). If it is not there, your browser does not support web-app installs.';
  }

  function showHelp() {
    var existing = document.getElementById('adminInstallHelp');
    if (existing) existing.remove();
    var ov = document.createElement('div');
    ov.id = 'adminInstallHelp';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = '<div style="background:#13151c;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:24px;max-width:420px;width:100%;color:#e2e8f0">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><img src="icons/admin-logo.png" width="34" height="34" style="border-radius:8px" alt="Studyria Admin"><b style="font-size:1rem">Install Studyria Admin</b></div>'
      + '<div style="font-size:.9rem;line-height:1.6;color:#94a3b8">' + helpModalBody() + '</div>'
      + '<button id="adminInstallHelpClose" style="margin-top:18px;width:100%;padding:10px;border:0;border-radius:10px;background:linear-gradient(90deg,#930205,#c99a3c);color:#fff;font-weight:600;cursor:pointer">Got it</button></div>';
    document.body.appendChild(ov);
    document.getElementById('adminInstallHelpClose').onclick = function () { ov.remove(); };
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
  }

  function renderInstallButton() {
    var bar = document.querySelector('#page-admin .admin-topbar-right');
    if (!bar) return;
    var btn = document.getElementById('adminInstallBtn');
    var state = document.getElementById('adminInstallState');
    if (state) state.remove();
    if (isStandalone()) {
      if (btn) btn.remove();
      // Honest "installed" state — real display-mode signal.
      var s = document.createElement('div');
      s.id = 'adminInstallState';
      s.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:.78rem;color:#10d98e;padding:6px 10px;border:1px solid rgba(16,217,142,.25);border-radius:10px';
      s.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Admin App Installed';
      bar.insertBefore(s, bar.firstChild);
      if (!_wasInstalledToastShown && typeof showToast === 'function') {
        _wasInstalledToastShown = true;
        showToast('Running as installed Admin App.', 'success');
      }
      return;
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'adminInstallBtn';
      btn.className = 'btn btn-ghost btn-sm';
      btn.style.cssText = 'font-size:.78rem;border:1px solid rgba(201,154,60,.4);color:#c99a3c';
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Install Studyria Admin';
      btn.onclick = doInstall;
      bar.insertBefore(btn, bar.firstChild);
    }
  }

  function doInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice.outcome !== 'accepted') deferredPrompt = null; // re-armable only via new event
        renderInstallButton();
      });
    } else {
      showHelp(); // honest fallback: browser has no install prompt support
    }
  }

  // CTA appears only when the authorized console renders (never on login,
  // never on the public site). renderAdmin is defined in the inline
  // console script which loads before this file.
  if (typeof window.renderAdmin === 'function') {
    var _origRenderAdmin = window.renderAdmin;
    window.renderAdmin = function () {
      var r = _origRenderAdmin.apply(this, arguments);
      if (window.adminSession) renderInstallButton();
      return r;
    };
  }

  // ── 4. Logout / sign-out hardening ────────────────────────────────
  // adminLogout (verbatim console code) already clears the session,
  // signs out and redirects away. This wrapper additionally wipes the
  // rendered console DOM so zero protected content remains in the page.
  if (typeof window.adminLogout === 'function') {
    var _origLogout = window.adminLogout;
    window.adminLogout = function () {
      var r = _origLogout.apply(this, arguments);
      if (!window.adminSession) {                       // logout actually happened (not cancelled)
        var main = document.getElementById('adminMain');
        if (main) main.innerHTML = '';
        var btn = document.getElementById('adminInstallBtn');
        if (btn) btn.remove();
      }
      return r;
    };
  }

  // Sign-outs from ANY channel (token expiry, another tab, SIGNED_OUT):
  if (window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') {
        try { sessionStorage.removeItem('studyria_admin_session'); } catch (e) {}
        window.adminSession = null;
        var main = document.getElementById('adminMain');
        if (main) main.innerHTML = '';
        document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
        var lp = document.getElementById('page-admin-login');
        if (lp) lp.classList.add('active');
      }
    });
  }
})();
