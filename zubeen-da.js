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

  /* Curated songs (zubeen-data.js) + verified archive (zubeen-songs.js) */
  var ARCH = window.ZUBEEN_SONGS || [];
  var ALL = D.songs.concat(ARCH);
  var PLAYLISTS = window.ZUBEEN_PLAYLISTS || [];
  var FEATURED = window.ZUBEEN_FEATURED || [];

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ── Favourites (device-local only — never transmitted) ───────── */
  var favs = (function () {
    try { return new Set(JSON.parse(localStorage.getItem('z_favs') || '[]')); }
    catch (e) { return new Set(); }
  })();
  function saveFavs() {
    try { localStorage.setItem('z_favs', JSON.stringify(Array.from(favs))); } catch (e) {}
  }
  function isFav(id) { return favs.has(id); }
  function toggleFav(id, btn) {
    if (favs.has(id)) { favs.delete(id); } else { favs.add(id); }
    saveFavs();
    if (btn) {
      btn.classList.toggle('on', favs.has(id));
      btn.setAttribute('aria-pressed', String(favs.has(id)));
      btn.setAttribute('aria-label', favs.has(id) ? 'Remove from favourites' : 'Add to favourites');
    }
  }
  window.ZubeenLib = {
    toggleFav: function (id, btn) { toggleFav(id, btn); },
    openPlaylist: function (id) { openPlaylist(id); },
    exitPlaylist: function () { exitPlaylist(); }
  };

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>'"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
    });
  }

  /* ══════════════════ MUSIC LIBRARY ══════════════════ */

  var state = { q: '', filter: 'all', cat: null, playlist: null, shown: 0 };
  var PAGE = 24;

  var FILTERS = [
    { id: 'all', label: 'সকলো গান' },
    { id: 'assamese', label: 'অসমীয়া' },
    { id: 'hindi', label: 'হিন্দী' },
    { id: 'bengali', label: 'বাংলা' },
    { id: 'bihu', label: 'বিহু' },
    { id: 'film', label: 'চলচ্চিত্ৰৰ গান' },
    { id: 'album', label: 'এলবাম' },
    { id: 'single', label: 'Singles' },
    { id: 'collab', label: 'Collaborations' },
    { id: 'fav', label: '⭐ প্ৰিয়' }
  ];

  function matchFilter(song, f) {
    var cats = song.categories || [];
    switch (f) {
      case 'all': return true;
      case 'assamese': return song.language === 'Assamese';
      case 'hindi': return song.language === 'Hindi';
      case 'bengali': return song.language === 'Bengali';
      case 'bihu': return cats.indexOf('bihu') >= 0;
      case 'film': return song.kind === 'film';
      case 'album': return song.kind === 'album';
      case 'single': return song.kind === 'single';
      case 'collab': return !!song.coSinger;
      case 'fav': return isFav(song.id);
      default: return true;
    }
  }

  function matchSearch(song, q) {
    if (!q) return true;
    q = q.toLowerCase();
    var hay = [song.title, song.album, song.film, song.language,
               song.composedBy, song.coSinger, song.artist, String(song.year || '')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function songCard(s) {
    var meta = [];
    if (s.film) meta.push('Film: <b>' + esc(s.film) + '</b>');
    if (s.album && s.album !== s.film) meta.push('Album: <b>' + esc(s.album) + '</b>');
    var langLine = esc(s.language) + (s.year ? ' · ' + s.year : ' · Details unavailable');
    meta.push(langLine + (s.durationSec ? ' <span class="z-dur">' + fmt(s.durationSec) + '</span>' : ''));
    var actions = '';
    if (s.yt) {
      actions = '<button class="z-play" onclick="ZubeenPlayer.play(\'' + s.id + '\')">▶ Play</button>';
    } else if (s.source_type === 'apple_music' && s.apple_embed) {
      actions = '<button class="z-play" onclick="ZubeenPlayer.play(\'' + s.id + '\')">▶ Preview</button>';
    }
    if (s.source) {
      actions += '<a class="z-official" style="font-size:0.72rem;padding:6px 10px" href="' + esc(s.source) + '" target="_blank" rel="noopener noreferrer" title="Open official source">↗ Official</a>';
    }
    var cover;
    if (s.cover) {
      cover = '<img src="' + esc(s.cover) + '" alt="" loading="lazy" />';
    } else {
      cover = '<div class="ph">' + esc(s.title.charAt(0)) + '</div>';
    }
    var srcBadge = s.yt
      ? '<span class="src-badge yt">YT MUSIC</span>'
      : (s.source_type === 'apple_music' ? '<span class="src-badge apple">APPLE MUSIC</span>' : '');
    var verified = s.verified
      ? '<span class="z-verified">✓ verified' + (s.verifiedAt ? ' ' + esc(s.verifiedAt) : '') + '</span>' : '';
    var fav = '<button class="z-fav' + (isFav(s.id) ? ' on' : '') + '" type="button" ' +
      'aria-pressed="' + isFav(s.id) + '" aria-label="' + (isFav(s.id) ? 'Remove from' : 'Add to') + ' favourites" ' +
      'onclick="ZubeenLib.toggleFav(\'' + s.id + '\', this)">⭐</button>';
    return '<article class="z-song" aria-label="' + esc(s.title) + '">' + fav +
      '<div class="z-song-art z-song-cover" aria-hidden="true">' + cover + srcBadge + '</div>' +
      '<h3 class="z-song-title">🎵 ' + esc(s.title) + verified + '</h3>' +
      '<p class="z-song-meta">' + meta.join('<br>') + '</p>' +
      (s.note ? '<p class="z-song-note">' + esc(s.note) + '</p>' : '') +
      '<div class="z-song-actions">' + actions + '</div>' +
      '<span class="z-source-tag">Source: ' + esc(s.sourceLabel) + '</span>' +
    '</article>';
  }

  function currentList() {
    var pool = state.playlist
      ? (PLAYLISTS.filter(function (p) { return p.id === state.playlist; })[0] || { songIds: [] }).songIds
          .map(function (id) { return ALL.filter(function (s) { return s.id === id; })[0]; })
          .filter(Boolean)
      : ALL;
    return pool.filter(function (s) {
      return matchFilter(s, state.filter) && matchSearch(s, state.q) &&
        (!state.cat || (s.categories || []).indexOf(state.cat) >= 0);
    });
  }

  var sentinelIO = null;

  function renderSongs(reset) {
    var list = currentList();
    var host = document.getElementById('z-song-list');
    if (!host) return;
    if (reset !== false) state.shown = 0;

    if (!list.length) {
      host.innerHTML = '<div class="z-state" role="status">' +
        '<div class="ic">🔍</div>' +
        '<p class="tt">No verified result found.</p>' +
        '<p>এই সংগ্ৰহত এতিয়ালৈ প্ৰকাশিত গানসমূহৰ ভিতৰত আপোনাৰ সন্ধানৰ কোনো ফলাফল নাই।</p></div>';
    } else {
      state.shown = Math.min(state.shown || 0, list.length);
      var slice = list.slice(0, state.shown + PAGE);
      state.shown = slice.length;
      host.innerHTML = slice.map(songCard).join('') +
        (state.shown < list.length
          ? '<button class="z-load-more" id="z-load-more" type="button">আৰু দেখুৱাওক · Load more (' + (list.length - state.shown) + ' left)</button>'
          : '');
      var more = document.getElementById('z-load-more');
      if (more) more.addEventListener('click', function () { renderSongs(false); });
    }

    var count = document.getElementById('z-song-count');
    if (count) {
      count.textContent = list.length + (list.length === 1 ? ' song' : ' songs') +
        (state.playlist ? ' in this collection' : ' — all individually verified');
    }

    var banner = document.getElementById('z-playlist-banner');
    if (banner) {
      if (state.playlist) {
        var pl = PLAYLISTS.filter(function (p) { return p.id === state.playlist; })[0];
        banner.hidden = false;
        banner.innerHTML = '🎶 এতিয়া চলি আছে: <b>' + esc(pl ? pl.name : '') + '</b> — ' +
          list.length + ' গান <button class="z-pl-exit" type="button" onclick="ZubeenLib.exitPlaylist()">✕ সকলো গানলৈ ঘূৰি যাওক</button>';
      } else {
        banner.hidden = true;
      }
    }
  }

  function openPlaylist(id) {
    state.playlist = id;
    state.shown = 0;
    renderSongs();
    var el = document.getElementById('music');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }
  function exitPlaylist() {
    state.playlist = null;
    state.shown = 0;
    renderSongs();
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
        state.shown = 0;
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

  function renderFeatured() {
    var wrap = document.getElementById('z-featured-wrap');
    var host = document.getElementById('z-featured');
    if (!wrap || !host) return;
    var songs = FEATURED.map(function (id) { return ALL.filter(function (s) { return s.id === id; })[0]; })
      .filter(Boolean);
    if (!songs.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    host.innerHTML = songs.map(function (s) {
      var art = s.cover
        ? '<img src="' + esc(s.cover) + '" alt="" loading="lazy" />'
        : '<div class="ph">' + esc(s.title.charAt(0)) + '</div>';
      var sub = s.film ? s.film : (s.album ? s.album : s.language);
      return '<button type="button" class="z-feat-card" onclick="ZubeenPlayer.play(\'' + s.id + '\')" aria-label="Play ' + esc(s.title) + '">' +
        '<div class="z-feat-art">' + art + '<span class="z-feat-play" aria-hidden="true">▶</span></div>' +
        '<div class="z-feat-meta"><div class="z-feat-title">' + esc(s.title) + '</div>' +
        '<div class="z-feat-sub">' + esc(sub) + '</div></div></button>';
    }).join('');
  }

  function renderPlaylists() {
    var wrap = document.getElementById('z-playlists-wrap');
    var host = document.getElementById('z-playlists');
    if (!wrap || !host) return;
    if (!PLAYLISTS.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    host.innerHTML = PLAYLISTS.map(function (p) {
      var n = (p.songIds || []).filter(function (id) {
        return ALL.some(function (s) { return s.id === id; });
      }).length;
      return '<button type="button" class="z-pl-card" onclick="ZubeenLib.openPlaylist(\'' + p.id + '\')">' +
        '<div class="z-pl-icon" aria-hidden="true">' + p.icon + '</div>' +
        '<div class="z-pl-name">' + esc(p.name) + '</div>' +
        '<div class="z-pl-desc">' + esc(p.desc) + '</div>' +
        '<div class="z-pl-count">' + n + ' গান · verified</div></button>';
    }).join('');
  }

  function renderStats() {
    var el = document.getElementById('z-lib-stats');
    if (!el) return;
    var n = ALL.length;
    var yt = ALL.filter(function (s) { return !!s.yt; }).length;
    var ap = ALL.filter(function (s) { return s.source_type === 'apple_music'; }).length;
    el.textContent = n + ' verified songs · ' + yt + ' full playback (YouTube official) · ' +
      ap + ' official Apple Music preview · প্ৰতিটো গানৰ উৎস পৃথকে পৃথকে পৰীক্ষা কৰা হৈছে';
  }

  function initLibraryBar() {
    var pa = document.getElementById('z-play-all');
    if (pa) pa.addEventListener('click', function () { ZP.playAll(false); });
    var sh = document.getElementById('z-shuffle-all');
    if (sh) sh.addEventListener('click', function () { ZP.playAll(true); });
  }

  function initCategories() {
    var host = document.getElementById('z-cats');
    if (!host) return;
    host.innerHTML = D.categories.map(function (c) {
      var n = ALL.filter(function (s) { return (s.categories || []).indexOf(c.id) >= 0; }).length;
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
      state.shown = 0;
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
    _queue: [], _qi: -1,

    findSong: function (id) {
      return ALL.filter(function (s) { return s.id === id; })[0] || null;
    },

    playableSongs: function () {
      return ALL.filter(function (s) { return !!s.yt; });
    },

    allSongs: function () { return ALL; },

    setQueue: function (ids, startId) {
      this._queue = (ids || []).slice();
      this._qi = startId ? this._queue.indexOf(startId) : 0;
      if (this._qi < 0) this._qi = 0;
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
      if (!song) return;
      if (song.source_type === 'apple_music' && song.apple_embed) {
        this._appleStart(song);
        return;
      }
      if (!song.yt) return;
      this._failed = false;
      var self = this;
      this._ensureApi().then(function () {
        self._start(song);
      }).catch(function () {
        self._fail(song);
      });
    },

    /* Apple Music official embed — honest in-page preview; the full
       song plays on Apple Music. No fake progress values. */
    _appleStart: function (song) {
      var vid = document.getElementById('z-player-vid');
      var bar = document.getElementById('z-player');
      if (!vid || !bar) return;
      this._pollStop();
      this._keeper(false);   /* Apple embed can't be remote-controlled — no fake background */
      /* keep _current so ⏭/⏮ still work — but this is not our playback */
      if (navigator.mediaSession) {
        try { navigator.mediaSession.playbackState = 'none'; navigator.mediaSession.metadata = null; } catch (e) {}
      }
      try { if (this._yt) this._yt.stopVideo(); } catch (e) {}
      vid.innerHTML = '<iframe style="width:100%;max-width:340px;height:140px;border:0;overflow:hidden;background:transparent" ' +
        'src="' + esc(song.apple_embed) + '" allow="autoplay *; encrypted-media *; clipboard-write" ' +
        'title="' + esc(song.title) + ' — Apple Music preview" loading="lazy"></iframe>';
      bar.classList.add('open', 'apple-mode');
      bar.setAttribute('aria-hidden', 'false');
      var title = document.getElementById('z-player-title');
      var artist = document.getElementById('z-player-artist');
      var srcmode = document.getElementById('z-player-srcmode');
      var fb = document.getElementById('z-player-fb');
      if (title) title.textContent = song.title;
      if (artist) artist.textContent = 'Zubeen Garg' + (song.film ? ' · ' + song.film : (song.album ? ' · ' + song.album : ''));
      if (srcmode) { srcmode.hidden = false; srcmode.textContent = 'Apple Music official preview — সম্পূৰ্ণ গানটো Apple Music-ত পোৱা যাব'; }
      if (fb) fb.hidden = true;
      this._current = song;
      this._setPlayIcon(false);
    },

    _start: function (song) {
      var self = this;
      var vid = document.getElementById('z-player-vid');
      var bar = document.getElementById('z-player');
      if (!vid || !bar) return;
      bar.classList.remove('apple-mode');
      var srcmode = document.getElementById('z-player-srcmode');
      if (srcmode) srcmode.hidden = true;

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

    /* ── Media Session: OS-level media controls + background play priority ── */
    _ms: function (song) {
      var ms = navigator.mediaSession;
      if (!ms) return;
      try {
        ms.metadata = new MediaMetadata({
          title: song.title,
          artist: 'Zubeen Garg' + (song.film ? ' · ' + song.film : (song.album ? ' · ' + song.album : '')),
          album: 'Zubeen Da — The Legacy',
          artwork: [
            { src: '/zubeen-hero-poster.webp', sizes: '512x512', type: 'image/webp' },
            { src: '/zubeen-hero-mobile.webp', sizes: '192x192', type: 'image/webp' }
          ]
        });
        var self = this;
        try { ms.setActionHandler('play', function () { if (self._yt && self._ready) self._yt.playVideo(); }); } catch (e) {}
        try { ms.setActionHandler('pause', function () { if (self._yt && self._ready) self._yt.pauseVideo(); }); } catch (e) {}
        try { ms.setActionHandler('nexttrack', function () { self.next(); }); } catch (e) {}
        try { ms.setActionHandler('previoustrack', function () { self.prev(); }); } catch (e) {}
        try {
          ms.setActionHandler('seekto', function (d) {
            if (self._yt && self._ready && d && typeof d.seekTime === 'number') {
              try { self._yt.seekTo(d.seekTime, true); } catch (e) {}
            }
          });
        } catch (e) {}
      } catch (e) { /* media-session is a nice-to-have; never break playback */ }
    },

    /* ── Background-play keeper ──────────────────────────────────────
       Mobile browsers suspend iframe media (YouTube) when the app goes
       to background. A near-silent native audio element playing in a
       loop grants the page persistent audio focus, so Chrome keeps the
       whole page — including the YouTube iframe — alive in background,
       with the Media Session notification we already provide.
       iOS is excluded: Safari suspends iframes regardless, and a lone
       silent loop there would just fake a notification. */
    _keeper: function (playing) {
      var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIOS) { this._ka = null; return; }
      var a = this._ka;
      if (!a && playing) {
        a = document.createElement('audio');
        a.src = '/zubeen-silence.wav';
        a.loop = true; a.preload = 'auto'; a.volume = 1;
        a.setAttribute('playsinline', ''); a.setAttribute('webkit-playsinline', '');
        a.style.display = 'none';
        document.body.appendChild(a);
        this._ka = a;
      }
      if (!a) return;
      try {
        if (playing) { var p = a.play(); if (p && p.catch) p.catch(function () {}); }
        else { a.pause(); }
      } catch (e) { /* keeper is best-effort; never break playback */ }
    },

    _vol: function () {
      var v = document.getElementById('z-player-vol');
      return v ? parseInt(v.value, 10) : 80;
    },

    _ui: function (song) {
      var bar = document.getElementById('z-player');
      var title = document.getElementById('z-player-title');
      var artist = document.getElementById('z-player-artist');
      if (bar) { bar.classList.add('open'); bar.classList.remove('apple-mode'); }
      if (title) title.textContent = song.title;
      if (artist) artist.textContent = 'Zubeen Garg' + (song.film ? ' · ' + song.film : (song.album ? ' · ' + song.album : ''));
      var fb = document.getElementById('z-player-fb');
      if (fb) fb.hidden = true;
      this._ms(song);
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
      var list = this._queue.length ? this._queue.map(function (id) { return ZP.findSong(id); }).filter(Boolean) : this.playableSongs();
      if (!list.length || !this._current) return;
      var i = list.map(function (s) { return s.id; }).indexOf(this._current.id);
      var j = (i + dir + list.length) % list.length;
      this.play(list[j].id);
    },

    playAll: function (shuffle) {
      var ids = currentList().map(function (s) { return s.id; });
      if (!ids.length) return;
      if (shuffle) {
        for (var i = ids.length - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
        }
      }
      this.setQueue(ids, ids[0]);
      this.play(ids[0]);
    },

    close: function () {
      var bar = document.getElementById('z-player');
      if (bar) { bar.classList.remove('open', 'apple-mode'); bar.setAttribute('aria-hidden', 'true'); }
      var vid = document.getElementById('z-player-vid');
      if (vid) vid.innerHTML = '';
      this._pollStop();
      if (this._yt) { try { this._yt.stopVideo(); } catch (e) {} }
      this._keeper(false);
      this._current = null;
      if (navigator.mediaSession) {
        try { navigator.mediaSession.playbackState = 'none'; navigator.mediaSession.metadata = null; } catch (e) {}
      }
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
          if (d > 0 && navigator.mediaSession && navigator.mediaSession.setPositionState) {
            try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(t, d), playbackRate: 1 }); } catch (e) {}
          }
        } catch (e) { /* audio failure never breaks the page */ }
      }, 500);
    },

    _pollStop: function () {
      if (this._poll) { clearInterval(this._poll); this._poll = null; }
    },

    _syncState: function (target) {
      var s = target.getPlayerState();
      this._setPlayIcon(s === 1);
      this._keeper(s === 1);
      if (navigator.mediaSession) {
        try { navigator.mediaSession.playbackState = s === 1 ? 'playing' : 'paused'; } catch (e) {}
      }
      /* Song finished → keep the music going: auto-advance to the next song in the queue */
      if (s === 0 && this._current && !this._failed && !this._ending) {
        var self = this;
        this._ending = true;
        setTimeout(function () { self._ending = false; self.next(); }, 400);
      }
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
      this._keeper(false);
      if (navigator.mediaSession) {
        try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
      }
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
    renderFeatured();
    renderPlaylists();
    renderStats();
    initLibraryBar();
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
