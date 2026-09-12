/* ══════════════════════════════════════════════════════════════════
   zubeen-da.js — ZUBEEN DA · THE LEGACY
   Standalone tribute page logic. Audio plays ONLY through the official
   YouTube IFrame API (official uploads verified in zubeen-data.js).
   No fabricated duration/progress — all player values come from the
   real player state. No autoplay — playback starts on user action only.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var D = window.ZUBEEN_DATA;
  if (!D) { console.error('[Zubeen] data file missing'); return; }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>'"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
    });
  }

  /* ══════════════════ MUSIC LIBRARY ══════════════════ */

  var state = { q: '', filter: 'all', cat: null };

  var FILTERS = [
    { id: 'all', label: 'সকলো গান' },
    { id: 'assamese', label: 'অসমীয়া' },
    { id: 'hindi', label: 'হিন্দী' },
    { id: 'bengali', label: 'বাংলা' },
    { id: 'bihu', label: 'বিহু' },
    { id: 'film', label: 'চলচ্চিত্ৰৰ গান' },
    { id: 'album', label: 'এলবাম' },
    { id: 'single', label: 'Singles' },
    { id: 'collab', label: 'Collaborations' }
  ];

  function matchFilter(song, f) {
    switch (f) {
      case 'all': return true;
      case 'assamese': return song.language === 'Assamese';
      case 'hindi': return song.language === 'Hindi';
      case 'bengali': return song.language === 'Bengali';
      case 'bihu': return song.categories.indexOf('bihu') >= 0;
      case 'film': return song.kind === 'film';
      case 'album': return song.kind === 'album';
      case 'single': return song.kind === 'single';
      case 'collab': return !!song.coSinger;
      default: return true;
    }
  }

  function matchSearch(song, q) {
    if (!q) return true;
    q = q.toLowerCase();
    var hay = [song.title, song.album, song.film, song.language,
               song.composedBy, song.coSinger, String(song.year || '')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function songCard(s) {
    var meta = [];
    if (s.album) meta.push('Album: <b>' + esc(s.album) + '</b>');
    if (s.film) meta.push('Film: <b>' + esc(s.film) + '</b>');
    meta.push(esc(s.language) + (s.year ? ' · ' + s.year : ' · Details unavailable'));
    var actions = '';
    if (s.yt) {
      actions = '<button class="z-play" onclick="ZubeenPlayer.play(\'' + s.id + '\')">▶ Play here</button>';
    } else {
      actions = '<a class="z-official" href="' + esc(s.source) + '" target="_blank" rel="noopener noreferrer">↗ ' + esc(s.sourceLabel) + '</a>';
    }
    if (s.yt && s.source) {
      actions += '<a class="z-official" style="font-size:0.72rem;padding:6px 10px" href="' + esc(s.source) + '" target="_blank" rel="noopener noreferrer" title="Open on YouTube">↗ Official</a>';
    }
    return '<article class="z-song" aria-label="' + esc(s.title) + '">' +
      '<div class="z-song-art" aria-hidden="true">' +
        '<span class="monogram">' + esc(s.title.charAt(0)) + '</span>' +
        (s.yt ? '<span class="yt-badge">▶ playable</span>' : '') +
      '</div>' +
      '<h3 class="z-song-title">🎵 ' + esc(s.title) + '</h3>' +
      '<p class="z-song-meta">' + meta.join('<br>') + '</p>' +
      (s.note ? '<p class="z-song-note">' + esc(s.note) + '</p>' : '') +
      '<div class="z-song-actions">' + actions + '</div>' +
      '<span class="z-source-tag">Source: ' + esc(s.sourceLabel) + '</span>' +
    '</article>';
  }

  function renderSongs() {
    var list = D.songs.filter(function (s) {
      return matchFilter(s, state.filter) && matchSearch(s, state.q) &&
        (!state.cat || s.categories.indexOf(state.cat) >= 0);
    });
    var host = document.getElementById('z-song-list');
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '<div class="z-state" role="status">' +
        '<div class="ic">🔍</div>' +
        '<p class="tt">No verified result found.</p>' +
        '<p>এই সংগ্ৰহত এতিয়ালৈ প্ৰকাশিত গানসমূহৰ ভিতৰত আপোনাৰ সন্ধানৰ কোনো ফলাফল নাই।</p></div>';
    } else {
      host.innerHTML = list.map(songCard).join('');
    }
    var count = document.getElementById('z-song-count');
    if (count) {
      count.textContent = list.length + (list.length === 1 ? ' song' : ' songs') + ' in this curated collection';
    }
  }

  function initFilters() {
    var fhost = document.getElementById('z-filters');
    if (fhost) {
      fhost.innerHTML = FILTERS.map(function (f) {
        return '<button class="z-chip" aria-pressed="' + (f.id === 'all') + '" data-f="' + f.id + '">' + f.label + '</button>';
      }).join('');
      fhost.addEventListener('click', function (e) {
        var b = e.target.closest('.z-chip'); if (!b) return;
        state.filter = b.getAttribute('data-f');
        fhost.querySelectorAll('.z-chip').forEach(function (c) {
          c.setAttribute('aria-pressed', String(c === b));
        });
        renderSongs();
      });
    }
    var input = document.getElementById('z-search');
    if (input) {
      input.addEventListener('input', function () {
        state.q = input.value.trim();
        var clear = document.getElementById('z-search-clear');
        if (clear) clear.hidden = !state.q;
        renderSongs();
      });
    }
    var clear = document.getElementById('z-search-clear');
    if (clear) {
      clear.addEventListener('click', function () {
        if (input) { input.value = ''; state.q = ''; }
        clear.hidden = true;
        renderSongs();
        if (input) input.focus();
      });
    }
  }

  function initCategories() {
    var host = document.getElementById('z-cats');
    if (!host) return;
    host.innerHTML = D.categories.map(function (c) {
      var n = D.songs.filter(function (s) { return s.categories.indexOf(c.id) >= 0; }).length;
      return '<button class="z-cat" aria-pressed="false" data-cat="' + c.id + '" aria-label="' + esc(c.name) + '">' +
        '<div class="ic" aria-hidden="true">' + c.icon + '</div>' +
        '<div class="nm">' + esc(c.name) + '</div>' +
        '<div class="ds">' + esc(c.desc) + '</div>' +
        '<div class="ct">' + n + ' song' + (n === 1 ? '' : 's') + '</div></button>';
    }).join('');
    host.addEventListener('click', function (e) {
      var b = e.target.closest('.z-cat'); if (!b) return;
      var id = b.getAttribute('data-cat');
      var wasOn = b.getAttribute('aria-pressed') === 'true';
      host.querySelectorAll('.z-cat').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
      state.cat = wasOn ? null : id;
      if (!wasOn) b.setAttribute('aria-pressed', 'true');
      renderSongs();
      var target = document.getElementById('music');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  }

  /* ══════════════════ CONTENT RENDERING ══════════════════ */

  function renderStatic() {
    /* Timeline */
    var tl = document.getElementById('z-timeline');
    if (tl) {
      tl.innerHTML = D.timeline.map(function (t) {
        return '<div class="z-tl-item">' +
          '<div class="z-tl-year">' + esc(t.year) + '</div>' +
          '<h3 class="z-tl-title">' + esc(t.title) + '</h3>' +
          '<p class="z-tl-text">' + esc(t.text) + '</p></div>';
      }).join('');
    }

    /* Cinema tabs — Actor tab has the verified filmography; the other
       tabs show honest status notes (no fabricated filmography). */
    var tabs = document.getElementById('z-film-tabs');
    if (tabs) {
      tabs.innerHTML = D.films.map(function (f) { return f; });
      var roles = {};
      D.films.forEach(function (f) { f.role.forEach(function (r) { roles[r] = true; }); });
      tabs.innerHTML = D.filmTabs.map(function (t, i) {
        return '<button class="z-tab" role="tab" aria-selected="' + (t === 'Actor') + '" data-t="' + t + '">' + t + '</button>';
      }).join('');
      tabs.addEventListener('click', function (e) {
        var b = e.target.closest('.z-tab'); if (!b) return;
        tabs.querySelectorAll('.z-tab').forEach(function (t) { t.setAttribute('aria-selected', String(t === b)); });
        renderFilmTab(b.getAttribute('data-t'));
      });
    }
    renderFilmTab('Actor');

    /* Albums */
    var al = document.getElementById('z-album-list');
    if (al) {
      al.innerHTML = D.albums.map(function (a) {
        var mt = esc(a.language) + (a.year ? ' · ' + a.year : '') + ' · ' + esc(a.type);
        var src = a.source ? '<div style="margin-top:10px"><a class="z-official" style="font-size:0.72rem;padding:5px 10px" href="' + esc(a.source) + '" target="_blank" rel="noopener noreferrer">↗ Official listening source</a></div>' : '<p class="z-source-tag" style="margin-top:10px">Official listening source being verified</p>';
        return '<div class="z-album">' +
          '<div class="disc" aria-hidden="true"></div>' +
          '<div class="tt">' + esc(a.title) + '</div>' +
          '<div class="mt">' + mt + '</div>' +
          (a.note ? '<div class="nt">' + esc(a.note) + '</div>' : '') +
          src + '</div>';
      }).join('');
    }

    /* Legacy */
    var lg = document.getElementById('z-legacy');
    if (lg) {
      lg.innerHTML = D.legacy.map(function (l) {
        return '<div class="z-card"><div class="ic" aria-hidden="true">' + l.icon + '</div>' +
          '<div class="tt">' + esc(l.title) + '</div><p class="tx">' + esc(l.text) + '</p></div>';
      }).join('');
    }

    /* Articles */
    var ar = document.getElementById('z-articles');
    if (ar) {
      ar.innerHTML = D.articles.map(function (a) {
        return '<div class="z-card"><span class="tg">' + esc(a.tag) + '</span>' +
          '<div class="tt">' + esc(a.title) + '</div><p class="tx">' + esc(a.snippet) + '</p></div>';
      }).join('');
    }

    /* Archive */
    var ac = document.getElementById('z-archive');
    if (ac) {
      ac.innerHTML = D.archive.map(function (a) {
        return '<div class="z-card"><div class="ic" aria-hidden="true">' + a.icon + '</div>' +
          '<div class="tt">' + esc(a.name) + '</div><p class="tx">' + esc(a.status) + '</p></div>';
      }).join('');
    }
  }

  function renderFilmTab(tab) {
    var panel = document.getElementById('z-film-panel');
    var note = document.getElementById('z-film-note');
    if (!panel) return;
    if (tab === 'Actor') {
      var films = D.films.filter(function (f) { return f.role.indexOf('Actor') >= 0 || f.role.indexOf('Director') >= 0; });
      panel.innerHTML = '<div class="z-films">' + films.map(function (f) {
        return '<div class="z-film"><div class="yr">' + f.year + '</div>' +
          '<div class="tt">' + esc(f.title) + '</div>' +
          '<div class="rl">' + f.role.join(' · ') + '</div>' +
          (f.note ? '<div class="nt">' + esc(f.note) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
      if (note) note.hidden = true;
    } else {
      panel.innerHTML = '';
      if (note) {
        note.hidden = false;
        note.textContent = D.filmTabNote[tab] || 'Information being verified.';
      }
    }
  }

  /* ══════════════════ YOUTUBE MINI PLAYER (official embeds only) ══════════════════ */

  var ZP = window.ZubeenPlayer = {
    _yt: null, _current: null, _ready: false, _poll: null, _pending: null, _failed: false,

    findSong: function (id) {
      return D.songs.filter(function (s) { return s.id === id; })[0] || null;
    },

    playableSongs: function () {
      return D.songs.filter(function (s) { return !!s.yt; });
    },

    _ensureApi: function () {
      if (window.YT && window.YT.Player) return Promise.resolve();
      if (!this._apiPromise) {
        this._apiPromise = new Promise(function (resolve) {
          window._zubeenYTReady = resolve;
          var tag = document.createElement('script');
          tag.src = 'https://www.youtube.com/iframe_api';
          tag.async = true;
          document.head.appendChild(tag);
        });
      }
      return this._apiPromise;
    },

    play: function (id) {
      var song = this.findSong(id);
      if (!song || !song.yt) return;
      this._failed = false;
      var self = this;
      this._ensureApi().then(function () {
        self._start(song);
      }).catch(function () {
        self._fail(song);
      });
    },

    _start: function (song) {
      var self = this;
      var vid = document.getElementById('z-player-vid');
      var bar = document.getElementById('z-player');
      if (!vid || !bar) return;

      /* Reuse player if the hidden div survived a re-render; recreate otherwise */
      if (!this._yt || !vid.firstChild) {
        vid.innerHTML = '';
        var holder = document.createElement('div');
        vid.appendChild(holder);
        this._yt = new window.YT.Player(holder, {
          videoId: song.yt,
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onReady: function (e) {
              self._ready = true;
              self._current = song;
              e.target.setVolume(self._vol());
              e.target.playVideo();
              self._ui(song);
              self._pollStart();
            },
            onStateChange: function (e) {
              self._syncState(e.target);
            },
            onError: function () { self._fail(song); }
          }
        });
      } else {
        this._current = song;
        try { this._yt.loadVideoById(song.yt); } catch (e) { self._fail(song); return; }
        this._ui(song);
        this._pollStart();
      }
    },

    _vol: function () {
      var v = document.getElementById('z-player-vol');
      return v ? parseInt(v.value, 10) : 80;
    },

    _ui: function (song) {
      var bar = document.getElementById('z-player');
      var title = document.getElementById('z-player-title');
      var artist = document.getElementById('z-player-artist');
      if (bar) bar.classList.add('open');
      if (title) title.textContent = song.title;
      if (artist) artist.textContent = 'Zubeen Garg' + (song.film ? ' · ' + song.film : (song.album ? ' · ' + song.album : ''));
      var fb = document.getElementById('z-player-fb');
      if (fb) fb.hidden = true;
      this._setPlayIcon(false);
    },

    toggle: function () {
      if (!this._yt || !this._ready) return;
      var s = this._yt.getPlayerState();
      if (s === 1) { this._yt.pauseVideo(); } else { this._yt.playVideo(); }
    },

    seek: function (val) {
      if (!this._yt || !this._ready) return;
      var d = this._yt.getDuration();
      if (d > 0) { try { this._yt.seekTo(val * d, true); } catch (e) {} }
    },

    setVol: function (v) {
      if (this._yt && this._ready) { try { this._yt.setVolume(v); } catch (e) {} }
    },

    next: function () { this._step(1); },
    prev: function () { this._step(-1); },

    _step: function (dir) {
      var list = this.playableSongs();
      if (!list.length || !this._current) return;
      var i = list.map(function (s) { return s.id; }).indexOf(this._current.id);
      var j = (i + dir + list.length) % list.length;
      this.play(list[j].id);
    },

    close: function () {
      var bar = document.getElementById('z-player');
      if (bar) bar.classList.remove('open');
      this._pollStop();
      if (this._yt) { try { this._yt.stopVideo(); } catch (e) {} }
    },

    _pollStart: function () {
      var self = this;
      this._pollStop();
      this._poll = setInterval(function () {
        if (!self._yt || !self._ready) return;
        try {
          var t = self._yt.getCurrentTime() || 0;
          var d = self._yt.getDuration() || 0;
          var prog = document.getElementById('z-player-prog');
          var times = document.getElementById('z-player-times');
          if (prog) {
            if (d > 0) {
              prog.disabled = false;
              if (!prog._dragging) prog.value = (t / d) * 1000;
            } else {
              prog.disabled = true;
            }
          }
          if (times) {
            /* Only real values — never fabricate duration */
            times.textContent = d > 0 ? (fmt(t) + ' / ' + fmt(d)) : 'Live / streaming';
          }
          self._setPlayIcon(self._yt.getPlayerState() === 1);
        } catch (e) { /* audio failure never breaks the page */ }
      }, 500);
    },

    _pollStop: function () {
      if (this._poll) { clearInterval(this._poll); this._poll = null; }
    },

    _syncState: function (target) {
      this._setPlayIcon(target.getPlayerState() === 1);
    },

    _setPlayIcon: function (playing) {
      var btn = document.getElementById('z-player-toggle');
      if (btn) btn.textContent = playing ? '❚❚' : '▶';
      var bar = document.getElementById('z-player');
      if (bar && playing) bar.classList.add('open');
    },

    /* If the official embed refuses playback, be honest — never fake it */
    _fail: function (song) {
      this._failed = true;
      this._pollStop();
      var fb = document.getElementById('z-player-fb');
      var bar = document.getElementById('z-player');
      if (bar) bar.classList.add('open');
      if (fb) {
        fb.hidden = false;
        fb.innerHTML = 'এই গানটো ইয়াত প্লে কৰিব নোৱাৰি — বিকল্প হিচাপে ' +
          '<a href="' + esc(song.source) + '" target="_blank" rel="noopener noreferrer">Official Music Platform খোলক</a>';
      }
    }
  };

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function initPlayerUI() {
    var toggle = document.getElementById('z-player-toggle');
    if (toggle) toggle.addEventListener('click', function () { ZP.toggle(); });
    var next = document.getElementById('z-player-next');
    if (next) next.addEventListener('click', function () { ZP.next(); });
    var prev = document.getElementById('z-player-prev');
    if (prev) prev.addEventListener('click', function () { ZP.prev(); });
    var close = document.getElementById('z-player-close');
    if (close) close.addEventListener('click', function () { ZP.close(); });
    var vol = document.getElementById('z-player-vol');
    if (vol) vol.addEventListener('input', function () { ZP.setVol(parseInt(vol.value, 10)); });
    var prog = document.getElementById('z-player-prog');
    if (prog) {
      prog.addEventListener('pointerdown', function () { prog._dragging = true; });
      prog.addEventListener('pointerup', function () { prog._dragging = false; });
      prog.addEventListener('change', function () { ZP.seek(parseInt(prog.value, 10) / 1000); });
    }
  }

  /* ══════════════════ MEMORIES & TRIBUTE WALL (Supabase) ══════════════════ */

  function sb() { return window.supabaseClient || null; }

  function renderTributes(rows) {
    var host = document.getElementById('z-tribute-list');
    if (!host) return;
    if (!rows || !rows.length) {
      host.innerHTML = '<div class="z-state" role="status"><div class="ic">🕊️</div>' +
        '<p class="tt">এই সংগ্ৰহটো এতিয়াও সাজু হোৱা নাই।</p>' +
        '<p>The first approved tributes will appear here. You can add yours below.</p></div>';
      return;
    }
    host.innerHTML = rows.map(function (t) {
      return '<div class="z-tribute">' +
        (t.status === 'featured' ? '<div class="feat">Featured</div>' : '') +
        '<div class="who">' + esc(t.name || 'অজ্ঞাত অনুৰাগী') + '</div>' +
        (t.favorite_song ? '<div class="song">🎵 ' + esc(t.favorite_song) + '</div>' : '') +
        '<div class="mem">' + esc(t.memory) + '</div></div>';
    }).join('');
    var count = document.getElementById('z-tribute-count');
    if (count) count.textContent = rows.length + ' approved ' + (rows.length === 1 ? 'tribute' : 'tributes');
  }

  function showTributeState(kind) {
    var host = document.getElementById('z-tribute-list');
    if (!host) return;
    if (kind === 'loading') {
      host.innerHTML = '<div class="z-state" role="status"><div class="z-spin" aria-label="Loading"></div>' +
        '<p class="tt">স্মৃতিসমূহ লোড হৈ আছে…</p></div>';
    } else if (kind === 'error') {
      host.innerHTML = '<div class="z-state" role="alert"><div class="ic">⚠️</div>' +
        '<p class="tt">স্মৃতিসমূহ লোড কৰিব নোৱাৰি।</p>' +
        '<p>Tributes could not be loaded right now.</p>' +
        '<div class="ac"><button class="z-retry" id="z-tribute-retry">↻ Retry</button></div></div>';
      var r = document.getElementById('z-tribute-retry');
      if (r) r.addEventListener('click', loadTributes);
    }
  }

  function loadTributes() {
    showTributeState('loading');
    var client = sb();
    if (!client) { showTributeState('error'); return; }
    client.from('zubeen_memories')
      .select('id,name,favorite_song,memory,status,created_at')
      .in('status', ['approved', 'featured'])
      .order('created_at', { ascending: false })
      .limit(60)
      .then(function (res) {
        if (res.error) { showTributeState('error'); return; }
        renderTributes(res.data || []);
      })
      .catch(function () { showTributeState('error'); });
  }

  function initMemoryForm() {
    var form = document.getElementById('z-memory-form');
    if (!form) return;
    var msg = document.getElementById('z-memory-msg');
    var btn = document.getElementById('z-memory-submit');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (msg) { msg.textContent = ''; msg.className = 'z-form-msg'; }

      var memory = (document.getElementById('z-m-memory') || {}).value || '';
      var consent = document.getElementById('z-m-consent');
      if (!memory.trim()) {
        if (msg) { msg.textContent = 'অনুগ্ৰহ কৰি আপোনাৰ স্মৃতিটো লিখক।'; msg.classList.add('err'); }
        return;
      }
      if (!consent || !consent.checked) {
        if (msg) { msg.textContent = 'প্ৰকাশৰ বাবে সন্মতি দিয়ক (checkbox tick কৰক)।'; msg.classList.add('err'); }
        return;
      }

      var client = sb();
      if (!client) {
        if (msg) { msg.textContent = 'Connection unavailable — please try again in a moment.'; msg.classList.add('err'); }
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = 'পঠিয়াই আছে…'; }

      var payload = {
        name: ((document.getElementById('z-m-name') || {}).value || '').trim() || null,
        favorite_song: ((document.getElementById('z-m-song') || {}).value || '').trim() || null,
        memory: memory.trim().slice(0, 2000),
        consent: true,
        status: 'pending'
      };

      client.from('zubeen_memories').insert(payload)
        .then(function (res) {
          if (btn) { btn.disabled = false; btn.textContent = 'স্মৃতি পঠিয়াওক'; }
          if (res.error) {
            /* Table not migrated yet → honest error, never fake success */
            if (msg) {
              var m = (res.error.message || '').toLowerCase();
              var missingTable = m.indexOf('does not exist') >= 0 ||
                m.indexOf('schema cache') >= 0 || m.indexOf('could not find') >= 0;
              msg.textContent = missingTable
                ? 'Submission is temporarily unavailable — the tribute archive is being set up. Please try again soon.'
                : 'Something went wrong. Please try again.';
              msg.classList.add('err');
            }
            return;
          }
          if (msg) {
            msg.textContent = 'আপোনাৰ স্মৃতিটো পঠিয়াই দিয়া হ\'ল। নিৰীক্ষণৰ পিছত ইয়াত প্ৰকাশ কৰা হ\'ব। ধন্যবাদ।';
            msg.classList.add('ok');
          }
          form.reset();
        })
        .catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = 'স্মৃতি পঠিয়াওক'; }
          if (msg) { msg.textContent = 'Something went wrong. Please try again.'; msg.classList.add('err'); }
        });
    });
  }

  /* ── Admin moderation (additive, gated; RLS is the real boundary) ── */
  function initAdmin() {
    var panel = document.getElementById('z-admin');
    if (!panel) return;
    var client = sb();
    if (!client) return;

    /* Only authenticated users see the panel; RLS decides what loads */
    client.auth.getUser().then(function (res) {
      if (!res || !res.data || !res.data.user) return;
      var email = res.data.user.email || '';
      client.from('zubeen_memories')
        .select('id,name,favorite_song,memory,status,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50)
        .then(function (r) {
          if (r.error) return; /* RLS denied → not an admin → panel stays hidden */
          panel.classList.add('show');
          renderAdminQueue(r.data || [], email);
        })
        .catch(function () {});
    }).catch(function () {});
  }

  function renderAdminQueue(rows, email) {
    var host = document.getElementById('z-admin-queue');
    var head = document.getElementById('z-admin-who');
    if (head) head.textContent = 'Moderation · signed in as ' + email;
    if (!host) return;
    if (!rows.length) {
      host.innerHTML = '<p class="tx" style="color:var(--z-muted);font-size:0.85rem">No pending memories right now.</p>';
      return;
    }
    host.innerHTML = rows.map(function (t) {
      return '<div class="z-admin-item" data-id="' + t.id + '">' +
        '<div class="hd">' + esc(t.name || 'Anonymous') + (t.favorite_song ? ' · 🎵 ' + esc(t.favorite_song) : '') + '</div>' +
        '<div class="st">Pending</div>' +
        '<p style="color:var(--z-cream-dim)">' + esc(t.memory) + '</p>' +
        '<div class="z-admin-actions">' +
          '<button class="z-admin-btn" data-act="approve">Approve</button>' +
          '<button class="z-admin-btn" data-act="feature">Feature</button>' +
          '<button class="z-admin-btn deny" data-act="reject">Reject</button>' +
        '</div></div>';
    }).join('');

    host.querySelectorAll('.z-admin-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var item = b.closest('.z-admin-item');
        var id = item ? item.getAttribute('data-id') : null;
        var act = b.getAttribute('data-act');
        if (!id) return;
        var status = act === 'approve' ? 'approved' : act === 'feature' ? 'featured' : 'rejected';
        var client = sb();
        if (!client) return;
        client.from('zubeen_memories').update({ status: status }).eq('id', id)
          .then(function (r) {
            if (r.error) { b.textContent = 'Failed'; return; }
            item.style.opacity = '0.4';
            item.querySelectorAll('.z-admin-btn').forEach(function (x) { x.disabled = true; });
            b.textContent = act === 'reject' ? 'Rejected' : (act === 'feature' ? 'Featured' : 'Approved ✓');
            loadTributes();
          });
      });
    });
  }

  /* ══════════════════ NAV / MISC ══════════════════ */

  function initNav() {
    var links = document.querySelectorAll('.z-navlinks a');
    if (!links.length) return;
    var sections = [];
    links.forEach(function (a) {
      var id = (a.getAttribute('href') || '').replace('#', '');
      var el = document.getElementById(id);
      if (el) sections.push({ a: a, el: el });
    });
    if (!('IntersectionObserver' in window) || !sections.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        sections.forEach(function (s) {
          s.a.setAttribute('aria-current', String(s.el === en.target));
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { io.observe(s.el); });
  }

  function initSmoothCta() {
    var listen = document.getElementById('z-cta-listen');
    if (listen) listen.addEventListener('click', function () {
      var el = document.getElementById('music');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
    var story = document.getElementById('z-cta-story');
    if (story) story.addEventListener('click', function () {
      var el = document.getElementById('journey');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
  }

  /* ══════════════════ BOOT ══════════════════ */

  function boot() {
    renderStatic();
    initFilters();
    initCategories();
    renderSongs();
    initPlayerUI();
    initMemoryForm();
    initNav();
    initSmoothCta();
    loadTributes();
    /* Wait for supabase.js auth session before admin check */
    setTimeout(initAdmin, 1200);
    /* YT API callback */
    window.onYouTubeIframeAPIReady = function () {
      if (window._zubeenYTReady) window._zubeenYTReady();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
