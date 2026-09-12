/* ══════════════════════════════════════════════════════════════════
   ZUBEEN DA · THE LEGACY — Admin manager (additive, standalone)
   Tab: Admin → 🕯️ Zubeen Da Legacy
   ------------------------------------------------------------------
   • Content overview is READ-ONLY and honest: songs / albums / films
     are code-managed, verified data (zubeen-data.js) — the panel
     reports their source/rights/verification status, it never
     fabricates or edits content.
   • Moderation works through the SAME Supabase RLS as the tribute
     page: only emails listed in zubeen_admins can read the queue or
     change statuses. RLS is the real boundary — this UI adds nothing.
   • If the migration (sql/zubeen-legacy-migration.sql) has not been
     run yet, the panel shows honest setup instructions instead of
     pretending anything exists.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var A = window.ZubeenLegacyAdmin = {
    state: { isAdmin: false, migrationMissing: false, rows: [], filter: 'all', loading: false }
  };

  function sb() { return window.supabaseClient || null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return String(iso || ''); }
  }

  /* ── Content overview (static verified data; loads zubeen-data.js on demand) ── */
  function loadContentData(cb) {
    if (window.ZUBEEN_DATA) return cb(window.ZUBEEN_DATA);
    var s = document.createElement('script');
    s.src = 'zubeen-data.js?v=3';
    s.onload = function () { cb(window.ZUBEEN_DATA || null); };
    s.onerror = function () { cb(null); };
    document.head.appendChild(s);
  }

  function contentOverviewHTML(D) {
    if (!D) return '<p class="zla-note">Content data could not be loaded — overview unavailable. The moderation queue below still works.</p>';
    var songs = (D.songs || []);
    var playable = songs.filter(function (s) { return !!s.yt; }).length;
    var linkOnly = songs.length - playable;
    var albums = (D.albums || []).length;
    var films = (D.films || []).length;
    var timeline = (D.timeline || []).length;
    var cats = (D.categories || []).length;
    var verifiedSongs = songs.filter(function (s) { return s.verified; }).length;

    var tile = function (num, label, sub) {
      return '<div class="zla-tile"><div class="zla-tile-num">' + num + '</div>' +
        '<div class="zla-tile-label">' + label + '</div><div class="zla-tile-sub">' + sub + '</div></div>';
    };
    return '<div class="zla-tiles">' +
      tile(songs.length, 'Songs', verifiedSongs + ' verified') +
      tile(playable, 'Play here', 'official embeds') +
      tile(linkOnly, 'Official link only', 'no verified embed') +
      tile(albums, 'Albums', 'curated archive') +
      tile(films, 'Films', 'verified filmography') +
      tile(timeline, 'Journey', 'timeline events') +
      '</div>' +
      '<p class="zla-note">Categories: ' + cats + ' editorial listening moods. All content is code-managed with per-item source / rights / verification status — ' +
      'nothing here is editable from the panel, and no counts are fabricated. The tribute page is the single source of display truth.</p>';
  }

  /* ── Migration / setup state (honest) ── */
  function migrationMissingHTML() {
    return '<div class="zla-card zla-warn">' +
      '<h3>⚠️ Database migration not run yet</h3>' +
      '<p class="zla-note">The <code>zubeen_memories</code> table does not exist in Supabase yet, so community memories and the tribute wall on ' +
      '<a href="/zubeen-da" target="_blank" rel="noopener">/zubeen-da</a> stay in their honest "temporarily unavailable" state.</p>' +
      '<ol class="zla-steps">' +
      '<li>Open Supabase → SQL Editor and run <code>sql/zubeen-legacy-migration.sql</code> from the studyria repo.</li>' +
      '<li>At the bottom of that SQL, insert your moderator email into <code>zubeen_admins</code> (the commented INSERT line).</li>' +
      '<li>Come back here and press ↺ Refresh — the moderation dashboard will come alive.</li>' +
      '</ol></div>';
  }

  function notAdminHTML(email) {
    return '<div class="zla-card zla-warn">' +
      '<h3>🔐 Moderator access not found</h3>' +
      '<p class="zla-note">The signed-in session' + (email ? ' (<b>' + esc(email) + '</b>)' : '') +
      ' is not in the <code>zubeen_admins</code> allowlist, so the moderation queue is hidden by RLS — exactly as designed.</p>' +
      '<p class="zla-note">To grant moderation, add the email to <code>zubeen_admins</code> in Supabase, then re-open this tab.</p></div>';
  }

  /* ── Dashboard + queue ── */
  function countsHTML(rows) {
    var c = { pending: 0, approved: 0, rejected: 0, featured: 0 };
    rows.forEach(function (r) { if (c[r.status] != null) c[r.status]++; });
    var chip = function (n, label, cls) {
      return '<div class="zla-tile ' + (cls || '') + '"><div class="zla-tile-num">' + n + '</div>' +
        '<div class="zla-tile-label">' + label + '</div><div class="zla-tile-sub">memories</div></div>';
    };
    return '<div class="zla-tiles">' +
      chip(rows.length, 'Total', '') +
      chip(c.pending, 'Pending', c.pending > 0 ? 'zla-att' : '') +
      chip(c.approved, 'Approved', '') +
      chip(c.featured, 'Featured', '') +
      chip(c.rejected, 'Rejected', '') +
      '</div>';
  }

  function statusChip(status) {
    var cls = { pending: 'zla-chip-pending', approved: 'zla-chip-approved', featured: 'zla-chip-featured', rejected: 'zla-chip-rejected' }[status] || '';
    return '<span class="zla-chip ' + cls + '">' + esc(status) + '</span>';
  }

  function queueHTML(rows) {
    var f = A.state.filter;
    var shown = f === 'all' ? rows : rows.filter(function (r) { return r.status === f; });
    if (!shown.length) {
      return '<div class="zla-card"><p class="zla-note" style="text-align:center;padding:24px 0">' +
        'এই সংগ্ৰহটো এতিয়াও সংৰক্ষণৰ কামত আছে — nothing to show in this view yet.</p></div>';
    }
    return '<div class="admin-table-card"><table class="admin-table" style="width:100%">' +
      '<thead><tr><th>Memory</th><th>Submitted</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead><tbody>' +
      shown.map(function (r) {
        var who = esc(r.name || 'Anonymous') + (r.favorite_song ? ' <span class="zla-song">♪ ' + esc(r.favorite_song) + '</span>' : '');
        var mem = esc((r.memory || '').length > 160 ? (r.memory || '').slice(0, 160) + '…' : (r.memory || ''));
        var acts = '';
        if (r.status !== 'approved') acts += '<button class="zla-btn" data-act="approve" data-id="' + r.id + '">Approve</button>';
        if (r.status !== 'featured') acts += '<button class="zla-btn" data-act="feature" data-id="' + r.id + '">Feature</button>';
        if (r.status === 'featured') acts += '<button class="zla-btn" data-act="unfeature" data-id="' + r.id + '">Unfeature</button>';
        if (r.status !== 'rejected') acts += '<button class="zla-btn zla-btn-warn" data-act="reject" data-id="' + r.id + '">Reject</button>';
        acts += '<button class="zla-btn zla-btn-danger" data-act="delete" data-id="' + r.id + '">Delete</button>';
        return '<tr><td style="max-width:420px"><div style="font-weight:600;font-size:.85rem">' + who + '</div>' +
          '<div style="font-size:.8rem;opacity:.75;margin-top:4px">' + mem + '</div></td>' +
          '<td style="white-space:nowrap;font-size:.78rem;opacity:.7">' + fmtDate(r.created_at) + '</td>' +
          '<td>' + statusChip(r.status) + '</td>' +
          '<td style="text-align:right"><div class="zla-actions">' + acts + '</div></td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function renderMain() {
    var host = document.getElementById('zla-root');
    if (!host) return;
    var s = A.state;
    var html = '<div class="zla-head"><div><h2 class="zla-h2">🕯️ Zubeen Da Legacy</h2>' +
      '<p class="zla-note">Tribute page manager — moderation, content &amp; archive status · <a href="/zubeen-da" target="_blank" rel="noopener">open /zubeen-da ↗</a></p></div>' +
      '<button class="zla-btn" id="zla-refresh">↺ Refresh</button></div>';

    html += '<div class="zla-section-label">Verified content overview (read-only)</div><div id="zla-content"></div>';

    html += '<div class="zla-section-label" style="margin-top:28px">Community memories — moderation</div>';
    if (s.migrationMissing) {
      html += migrationMissingHTML();
    } else if (!s.isAdmin) {
      html += notAdminHTML(s.email);
    } else {
      html += '<div id="zla-counts">' + countsHTML(s.rows) + '</div>';
      html += '<div class="zla-filters" id="zla-filters">' +
        ['all', 'pending', 'approved', 'featured', 'rejected'].map(function (f) {
          return '<button class="zla-fbtn' + (s.filter === f ? ' active' : '') + '" data-filter="' + f + '">' +
            (f === 'all' ? 'সকলো (All)' : f) + '</button>';
        }).join('') + '</div>';
      html += '<div id="zla-queue">' + queueHTML(s.rows) + '</div>';
    }
    host.innerHTML = html;

    var rf = document.getElementById('zla-refresh');
    if (rf) rf.onclick = function () { A.refresh(); };
    var fl = document.getElementById('zla-filters');
    if (fl) fl.onclick = function (e) {
      var b = e.target.closest('[data-filter]');
      if (!b) return;
      A.state.filter = b.getAttribute('data-filter');
      Array.prototype.forEach.call(fl.children, function (x) { x.classList.toggle('active', x === b); });
      var q = document.getElementById('zla-queue');
      if (q) q.innerHTML = queueHTML(A.state.rows);
    };
    var qh = document.getElementById('zla-queue');
    if (qh) qh.addEventListener('click', onAction);
  }

  function onAction(e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');
    var client = sb();
    if (!client) return;
    btn.disabled = true;

    if (act === 'delete') {
      if (!window.confirm('Delete this memory permanently? This cannot be undone.')) { btn.disabled = false; return; }
      client.from('zubeen_memories').delete().eq('id', id)
        .then(function () { A.refresh(); });
      return;
    }
    var status = act === 'approve' ? 'approved' : act === 'feature' ? 'featured' : act === 'unfeature' ? 'approved' : 'rejected';
    client.from('zubeen_memories').update({ status: status, updated_at: new Date().toISOString() }).eq('id', id)
      .then(function (res) {
        if (res && res.error) { console.error('[ZLA] moderate failed', res.error); btn.disabled = false; return; }
        A.refresh();
      });
  }

  /* ── Data loading ── */
  A.refresh = function () {
    var client = sb();
    var host = document.getElementById('zla-root');
    if (!host) return;
    if (!client) {
      host.innerHTML = '<div class="zla-card zla-warn"><h3>Supabase client unavailable</h3>' +
        '<p class="zla-note">The Supabase client is still initializing. Press ↺ Refresh in a moment.</p></div>';
      return;
    }
    A.state.loading = true;
    var cEl = document.getElementById('zla-content');
    loadContentData(function (D) {
      if (cEl) cEl.innerHTML = contentOverviewHTML(D);
    });

    client.auth.getSession().then(function (res) {
      var email = (res && res.data && res.data.session && res.data.session.user && res.data.session.user.email) || null;
      A.state.email = email;

      // Admin check: zubeen_admins is readable only to allowlisted emails (own row).
      client.from('zubeen_admins').select('email').then(function (r) {
        if (r.error) {
          // 42P01 = undefined_table → migration not run
          A.state.migrationMissing = !!(r.error.code === '42P01' || /does not exist/i.test(r.error.message || ''));
          A.state.isAdmin = false;
        } else {
          A.state.migrationMissing = false;
          A.state.isAdmin = (r.data || []).length > 0;
        }
        if (A.state.migrationMissing || !A.state.isAdmin) { A.state.rows = []; A.state.loading = false; renderMain(); return; }

        client.from('zubeen_memories')
          .select('id,name,favorite_song,memory,status,created_at')
          .order('created_at', { ascending: false })
          .limit(200)
          .then(function (m) {
            A.state.rows = (m && !m.error && m.data) ? m.data : [];
            A.state.loading = false;
            renderMain();
          });
      });
    });
  };

  A.render = function (main) {
    main.innerHTML = '<div id="zla-root"><p class="zla-note" style="padding:20px 0">Loading Zubeen Da Legacy manager…</p></div>';
    A.refresh();
  };

  window.renderZubeenLegacyAdmin = A.render;
})();
