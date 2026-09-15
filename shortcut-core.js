/* ═══════════════════════════════════════════════════════════════════
   shortcut-core.js — Studyria "My Shortcuts" V8 — PURE CONFIG + LOGIC
   ───────────────────────────────────────────────────────────────────
   Zero DOM, zero Supabase, zero side effects. This file ONLY defines:
     • the fixed route allowlist (every entry verified to exist in prod)
     • the client-side validator (max 4, allowlist-only, order-preserving)
     • the default (guest / first-run) shortcut set

   Persistence & UI live in pwa-v32.js (§ SHORTCUTS).
   Server-side enforcement lives in sql/user-shortcuts-migration.sql.

   SECURITY: shortcut destinations are stored ONLY as allowlist IDs.
   No URLs, no javascript:, no data: — navigation is dispatched by
   window.PWA32._scGo(id) which switches on the ID and calls the same
   navigate()/BrainLab.switchTab()/switchMeTab() patterns the production
   hamburger menu already uses. An arbitrary ID is rejected by validate().
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── FIXED ROUTE ALLOWLIST ──────────────────────────────────────────
     Every nav.page is in the production _SPA_PUBLIC_PAGES set.
     Every blTab is a verified BrainLab.switchTab() key.
     blScroll targets verified section element IDs.
     meTab pattern verified in the production hamburger menu.          */
  var ALLOWLIST = {
    'home':             { label: 'Home',            icon: '🏠', desc: 'Studyria home',              nav: { page: 'home' } },
    'library':          { label: 'PDF Library',     icon: '📚', desc: 'All exam PDF materials',     nav: { page: 'library' } },
    'free-materials':   { label: 'Free Materials',  icon: '📖', desc: 'Free PDFs & notes',          nav: { page: 'free-materials' } },
    'premium':          { label: 'Premium Pass',    icon: '👑', desc: 'Premium membership',         nav: { page: 'premium' } },
    'career-hub':       { label: 'Career Hub',      icon: '💼', desc: 'Jobs, alerts & results',     nav: { page: 'career-hub' } },
    'dashboard':        { label: 'Dashboard',       icon: '📊', desc: 'Your account overview',      nav: { page: 'dashboard' } },
    'wishlist':         { label: 'Wishlist',       icon: '❤️', desc: 'Saved for later',            nav: { page: 'wishlist' } },
    'campus':           { label: 'Campus',          icon: '🎓', desc: 'Campus community',           nav: { page: 'campus' } },
    'my-library':       { label: 'My Library',      icon: '📂', desc: 'Your purchased PDFs',        nav: { page: 'my-library' } },
    'brainlab':         { label: 'BrainLab',        icon: '🧠', desc: 'Practice & tests hub',        nav: { page: 'brainlab' } },
    'brainlab-mocks':   { label: 'Mock Tests',     icon: '📝', desc: 'Full-length mock tests',      nav: { page: 'brainlab', blTab: 'mock' } },
    'brainlab-quizzes': { label: 'Quizzes',        icon: '🧩', desc: 'Category-wise quizzes',        nav: { page: 'brainlab', blTab: 'quiz' } },
    'brainlab-pyq':     { label: 'PYQ Practice',    icon: '❓', desc: 'Previous year questions',     nav: { page: 'brainlab', blScroll: 'bl-sec-pyq' } },
    'brainlab-affairs': { label: 'Current Affairs', icon: '📰', desc: 'Daily current affairs',       nav: { page: 'brainlab', blTab: 'affairs' } },
    'brainlab-leader':  { label: 'Leaderboard',    icon: '🏆', desc: 'Quiz rankings',              nav: { page: 'brainlab', blTab: 'leaderboard' } },
    'brainlab-perf':    { label: 'Progress',       icon: '📈', desc: 'Your quiz analytics',         nav: { page: 'brainlab', blTab: 'performance' } }
  };

  var MAX_SHORTCUTS = 4;

  /* Default (guest / never-customized) set — real public routes only.
     Mirrors the task spec example: BrainLab, Mock Tests, Free
     Materials, Current Affairs. */
  var DEFAULT_IDS = ['brainlab', 'brainlab-mocks', 'free-materials', 'brainlab-affairs'];

  /* ── VALIDATOR ──────────────────────────────────────────────────────
     Order-preserving. Rejects unknown IDs, rejects anything beyond 4,
     de-duplicates. Returns a clean array of allowlist IDs (max 4). */
  function validate(ids) {
    if (!Array.isArray(ids)) return [];
    var seen = {};
    var out = [];
    for (var i = 0; i < ids.length && out.length < MAX_SHORTCUTS; i++) {
      var id = ids[i];
      // Only exact-string allowlist IDs pass — no coercion, no URLs.
      if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(ALLOWLIST, id) && !seen[id]) {
        seen[id] = true;
        out.push(id);
      }
    }
    return out;
  }

  function isAllowed(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ALLOWLIST, id);
  }

  function get(id) {
    return isAllowed(id) ? ALLOWLIST[id] : null;
  }

  /* ── PERSISTENCE SHAPE (V8.1) ─────────────────────────────────────
     ONE canonical device key holds a versioned payload:
       { "version": 1, "shortcuts": ["brainlab", ...], "updatedAt": ISO }
     sanitizePrefs() is the single authority for what a stored payload
     may look like — corrupted/tampered data yields null and the caller
     safely falls back to defaults. Only shortcut IDs + ordering +
     schema/version metadata are ever stored. No URLs, no secrets. */
  var PREFS_KEY = 'studyria_shortcuts_v1';
  var PREFS_VERSION = 1;
  var LEGACY_PREFIX = 'shortcuts_v1:';  /* V8 per-identity keys — migrated once */

  function sanitizePrefs(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    /* Accept the V8.1 shape ({shortcuts}) and — defensively — a stray
       V8 shape ({ids}) so a half-written payload never breaks loading. */
    var ids = Array.isArray(raw.shortcuts) ? raw.shortcuts
            : (Array.isArray(raw.ids) ? raw.ids : null);
    if (!ids) return null;
    return { version: PREFS_VERSION, shortcuts: validate(ids) };
  }

  /* Pick the best legacy V8 candidate (most recently updated wins). */
  function chooseLegacy(candidates) {
    if (!Array.isArray(candidates)) return null;
    var best = null, bestAt = '';
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!c || typeof c.key !== 'string' || !Array.isArray(c.ids)) continue;
      var clean = validate(c.ids);
      if (!clean.length) continue;
      var at = typeof c.updatedAt === 'string' ? c.updatedAt : '';
      if (!best || at > bestAt) { best = { key: c.key, ids: clean }; bestAt = at; }
    }
    return best;
  }

  /* ── CLOUD SYNC — HONESTLY OFF ────────────────────────────────────
     The additive Supabase migration (sql/user-shortcuts-migration.sql)
     has NOT been run yet (planned ~Oct 2026) — the user_shortcut_prefs
     table does not exist. While this flag is false, pwa-v32.js makes
     ZERO requests to that table: no 404/4xx probing, no console spam.
     Feature works fully per-device without it.
     TO ENABLE CROSS-DEVICE SYNC LATER: run the SQL migration in the
     Supabase SQL editor, then flip this to true. The gated cloud
     branches in pwa-v32.js activate with no rebuild: cloud preference
     becomes canonical (last-write-wins by updatedAt), local stays the
     offline fallback. Do NOT flip before the SQL has been run. */
  var CLOUD_SYNC_ENABLED = false;

  var API = {
    ALLOWLIST: ALLOWLIST,
    MAX: MAX_SHORTCUTS,
    DEFAULT_IDS: Object.freeze(DEFAULT_IDS.slice()),
    validate: validate,
    isAllowed: isAllowed,
    get: get,
    PREFS_KEY: PREFS_KEY,
    PREFS_VERSION: PREFS_VERSION,
    LEGACY_PREFIX: LEGACY_PREFIX,
    sanitizePrefs: sanitizePrefs,
    chooseLegacy: chooseLegacy,
    CLOUD_SYNC_ENABLED: CLOUD_SYNC_ENABLED
  };

  /* Browser: attach under window.StudyriaShortcuts */
  if (typeof window !== 'undefined') {
    window.StudyriaShortcuts = API;
  }
  /* Node (tests): CommonJS export, no DOM required */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
})();
