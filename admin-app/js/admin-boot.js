/* ══════════════════════════════════════════════════════════════════
   admin-boot.js — Studyria Admin App shell boot
   ─────────────────────────────────────────────────────────────────
   • Initializes the SAME Supabase client (same project as the public
     site — single source of truth for auth + data + RLS).
   • Provides the few globals the extracted console expects from the
     public shell: showToast(), navigate() (2-page shim), and boot.
   • Session hardening (spec §4): on every boot, a stored admin
     session is RE-VALIDATED against a live Supabase auth session AND
     the admin_users table before the console can render. A crafted
     sessionStorage value alone can never reveal the console (and RLS
     still gates every query regardless).
   ══════════════════════════════════════════════════════════════════ */

// ── Supabase client init (identical to the public site) ────────────
(function initSupabase() {
  const SUPABASE_URL  = 'https://qsdfmgcekdpjdcyqhuhi.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZtZ2Nla2RwamRjeXFodWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NTE2NDcsImV4cCI6MjA5NjIyNzY0N30.kDOEYxUQyLTp1blasuX2kVSIy2olGLhdqqtOMTlEX5g';
  const sdk = window.supabaseLib || window.supabase;
  if (!sdk || typeof sdk.createClient !== 'function') {
    console.error('[admin-app] Supabase SDK not found — check CDN load order.');
    return;
  }
  window.supabaseClient = sdk.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 10 } },
  });
})();

// ── showToast (verbatim from the production shell) ──────────────────
let toastId = 0;
function showToast(msg, type = 'info') {
  const id = ++toastId;
  const validTypes = ['success', 'error', 'warning', 'info'];
  const safeType = validTypes.includes(type) ? type : 'info';
  const iconMap = { success: '#ic-check', error: '#ic-zap', warning: '#ic-zap', info: '#ic-zap' };
  const icon = iconMap[safeType];
  const el = document.createElement('div');
  el.className = `toast toast--${safeType}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <span class="toast-icon-wrap"><svg width="14" height="14"><use href="${icon}"/></svg></span>
    <span class="toast-msg"></span>
    <button class="toast-close" aria-label="Dismiss" onclick="this.closest('.toast').remove()">&times;</button>
  `;
  el.querySelector('.toast-msg').textContent = msg;
  const box = document.getElementById('toastContainer');
  if (box) box.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// ── navigate() shim — 2-page app + redirect to the public site ─────
const PUBLIC_SITE = 'https://studyria.qzz.io/';
function navigate(page) {
  if (page === 'admin') {
    if (typeof renderAdmin === 'function') renderAdmin();
    return;
  }
  if (page === 'admin-login') {
    if (typeof renderAdmin === 'function') renderAdmin(); // no session → shows login
    return;
  }
  if (page === 'upload') {
    // Smart Publish workflow lives inside the Add New PDF tab.
    if (typeof switchAdminTab === 'function' && window.adminSession) switchAdminTab('add-pdf');
    else renderAdmin();
    return;
  }
  // Everything else belongs to the public site.
  window.location.href = PUBLIC_SITE + '#' + String(page || 'home');
}
window.navigate = navigate;

// ── Boot: show login by default, then harden-validate any stored ───
document.addEventListener('DOMContentLoaded', async function () {
  // default state: login page visible, console hidden
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const loginPage = document.getElementById('page-admin-login');
  if (loginPage) loginPage.classList.add('active');

  const clear = () => { try { sessionStorage.removeItem('studyria_admin_session'); } catch (e) {} window.adminSession = null; };
  const openConsole = () => {
    if (typeof updateAdminTopbar === 'function') updateAdminTopbar();
    if (typeof renderAdmin === 'function') renderAdmin();
  };

  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem('studyria_admin_session') || 'null'); } catch (e) {}

  // React to sign-outs that happen while the app is open.
  // P0 FIX: register the listener BEFORE the restore branch — the early
  // `return` on a successful session restore previously skipped this
  // entirely, so after a refresh-restore the app never reacted to signOut.
  if (window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clear();
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        if (loginPage) loginPage.classList.add('active');
        if (typeof showToast === 'function') showToast('Signed out.', 'info');
      }
    });
  }

  if (stored && stored.email) {
    try {
      const client = window.supabaseClient;
      if (!client) throw new Error('no client');
      const { data: { session } } = await client.auth.getSession();
      if (!session || !session.user) throw new Error('no session');
      // The signed-in Supabase user must BE the stored admin.
      const email = (session.user.email || '').toLowerCase();
      if (email !== String(stored.email).toLowerCase()) throw new Error('mismatch');
      // Re-check the admin_users authorization table (fresh, every boot).
      const { data: adminRow } = await client.from('admin_users').select('*').eq('email', email).single();
      if (!adminRow) throw new Error('not admin');
      // All good — let the console restore its own session object.
      openConsole();
      return;
    } catch (e) {
      clear();
      // fall through: login stays visible
      if (typeof showToast === 'function' && e.message !== 'no client') {
        showToast('Session expired — please sign in again.', 'info');
      }
    }
  }
});

// ── Mobile drawer: close when a nav item is tapped ──────────────────
document.addEventListener('click', function (e) {
  const item = e.target.closest && e.target.closest('.admin-nav-item');
  if (item) document.body.classList.remove('admin-drawer-open');
});
