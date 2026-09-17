/* ══════════════════════════════════════════════════════════════════
   admin-diag.js — TEMPORARY on-screen diagnostic (touch-dead bug)
   Pure observation: passive listeners only, no preventDefault, no
   stopPropagation, no behavior changes. Remove after diagnosis.
   Shows: script/global health, tap event reception, element hit,
   JS errors, SW controller state — all on a small chip.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  try {
    var chip = document.createElement('div');
    chip.id = 'adminDiagChip';
    chip.style.cssText = 'position:fixed;bottom:10px;left:10px;z-index:2147483000;'
      + 'background:rgba(0,0,0,.85);color:#0f0;font:11px/1.5 monospace;'
      + 'border:1px solid #0f0;border-radius:8px;padding:8px 10px;max-width:92vw;'
      + 'max-height:60vh;overflow:auto;pointer-events:auto;white-space:pre-wrap;'
      + 'direction:ltr;text-align:left;';
    var log = [];
    function render() {
      chip.textContent = 'DIAG ' + log.join('\n');
    }
    function add(s) { log.push(s); if (log.length > 14) log.shift(); render(); }

    document.addEventListener('DOMContentLoaded', function () {
      var g = function (n) { return (typeof window[n] !== 'undefined' && window[n]) ? 'OK' : 'DEAD'; };
      add('boot:DOM OK');
      add('supabaseClient:' + g('supabaseClient'));
      add('navigate:' + g('navigate'));
      add('adminDoLogin:' + g('adminDoLogin'));
      add('renderAdmin:' + g('renderAdmin'));
      add('switchAdminTab:' + g('switchAdminTab'));
      add('sw:' + (navigator.serviceWorker && navigator.serviceWorker.controller
        ? navigator.serviceWorker.controller.state : 'none'));
      add('vp:' + window.innerWidth + 'x' + window.innerHeight);
    });

    window.addEventListener('error', function (e) {
      add('ERR ' + (e.message || 'unknown') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno);
    }, true);
    window.addEventListener('unhandledrejection', function (e) {
      add('REJ ' + (e.reason && e.reason.message ? e.reason.message : 'promise'));
    });

    var taps = 0;
    function hit(e) {
      taps++;
      var t = e.target;
      var cs = t && getComputedStyle(t);
      add('tap#' + taps + '→ ' + (t ? (t.tagName + (t.id ? '#' + t.id : '') + (t.className && typeof t.className === 'string' ? '.' + t.className.split(' ')[0] : '')) : 'null')
        + ' | pe:' + (cs ? cs.pointerEvents : '?') + ' z:' + (cs ? cs.zIndex : '?'));
    }
    ['pointerdown', 'touchstart', 'click'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { try { hit(e); } catch (_) {} }, { passive: true, capture: true });
    });

    // Long-press the chip to hide it
    var pressT = 0;
    chip.addEventListener('pointerdown', function () { pressT = Date.now(); });
    chip.addEventListener('pointerup', function () { if (Date.now() - pressT > 600) chip.remove(); });

    function mount() { document.body ? document.body.appendChild(chip) : setTimeout(mount, 50); }
    mount();
    add('diag loaded');
  } catch (e) { /* never break the app for diagnostics */ }
})();
