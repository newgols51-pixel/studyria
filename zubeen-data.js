/* ══════════════════════════════════════════════════════════════════
   zubeen-data.js — ZUBEEN DA · THE LEGACY
   Verified data only. Sources: Wikipedia (Zubeen Garg, accessed via
   official Wikipedia API), YouTube oEmbed verification, and official
   label uploads (Sony Music / RDC Assamese Official / N.K. Production /
   Times Music Axom / DIGI Music / Heritage Jhankar).
   NO fabricated songs, years, films or links. Unverified fields are
   left null and rendered as "Details unavailable".
   ══════════════════════════════════════════════════════════════════ */

window.ZUBEEN_DATA = {

  meta: {
    name: 'Zubeen Garg',
    assameseName: 'জুবিন দা',
    epithet: 'THE HEARTTHROB OF ASSAM',
    epithetAs: 'ঈশ্বৰ পুত্ৰ',
    years: '1972 — 2025',
    bornText: '১৮ নৱেম্বৰ ১৯৭২ · টুৰা, মেঘালয়',
    diedText: '১৯ ছেপ্টেম্বৰ ২০২৫ · ছিংগাপুৰ',
    sourceNote: 'Facts verified from publicly documented sources (Wikipedia). Anything unverified is marked "Information being verified."',
    editorialNote: 'The listening categories below are editorial groupings made for this tribute — they are not official classifications by Zubeen Da.'
  },

  /* ── SONGS — playback_type 'embed' = official YouTube embed verified
     to exist (playable in page). 'link' = official-platform link only.
     rightsStatus explains the legal basis of each source. ──────── */
  songs: [
    {
      id: 'ya-ali', title: 'Ya Ali', album: null, film: 'Gangster', year: 2006,
      language: 'Hindi', kind: 'film', composedBy: 'Pritam', coSinger: null,
      categories: ['love', 'energetic'],
      yt: 'ReRBW9hTSY0', source: 'https://www.youtube.com/watch?v=ReRBW9hTSY0',
      sourceLabel: 'Sony Music / Vishesh Films (official YouTube audio)',
      rightsStatus: 'Official label upload', verified: true,
      note: 'His biggest Bollywood breakthrough — won him Best Playback Singer (Global Indian Film Awards, 2006).'
    },
    {
      id: 'anamika-album', title: 'Anamika (full album jukebox)', album: 'Anamika', film: null, year: 1992,
      language: 'Assamese', kind: 'album', composedBy: 'Zubeen Garg', coSinger: 'Kavita Krishnamurti (selected tracks)',
      categories: ['memory', 'calm'],
      yt: 'FrQxbbNPgg8', source: 'https://www.youtube.com/watch?v=FrQxbbNPgg8',
      sourceLabel: 'RDC Assamese Official (official YouTube channel)',
      rightsStatus: 'Official channel upload', verified: true,
      note: 'His 1992 debut solo album — the record that made him a trendsetter in Assam.'
    },
    {
      id: 'jonaki-mon-album', title: 'Junaki Mon (full album jukebox)', album: 'Junaki Mon', film: null, year: 1993,
      language: 'Assamese', kind: 'album', composedBy: 'Zubeen Garg', coSinger: null,
      categories: ['feeling', 'calm'],
      yt: 'ONWV0Mjwryk', source: 'https://www.youtube.com/watch?v=ONWV0Mjwryk',
      sourceLabel: 'RDC Assamese Official (official YouTube channel)',
      rightsStatus: 'Official channel upload', verified: true, note: null
    },
    {
      id: 'kiyo-janu', title: 'Kiyo Janu', album: 'Anamika', film: null, year: 1992,
      language: 'Assamese', kind: 'album', composedBy: 'Zubeen Garg', coSinger: 'Kavita Krishnamurthi',
      categories: ['love'],
      yt: '26BZwLojCYc', source: 'https://www.youtube.com/watch?v=26BZwLojCYc',
      sourceLabel: 'DIGI Music (official YouTube channel)',
      rightsStatus: 'Official channel upload', verified: true, note: null
    },
    {
      id: 'pothe-pothe', title: 'Pothe Pothe Junake', album: 'Anamika', film: null, year: 1992,
      language: 'Assamese', kind: 'album', composedBy: 'Zubeen Garg', coSinger: 'Kavita Krishnamurthy',
      categories: ['love', 'calm'],
      yt: '0ZNWDxrkZFk', source: 'https://www.youtube.com/watch?v=0ZNWDxrkZFk',
      sourceLabel: 'N.K. Production (official YouTube channel)',
      rightsStatus: 'Official channel upload', verified: true, note: null
    },
    {
      id: 'morom-nodir', title: 'Morom Nodir Gabhoru Ghat', album: null, film: 'Morom Nodir Gabhoru Ghat', year: 1999,
      language: 'Assamese', kind: 'film', composedBy: 'Zubeen Garg / Atul Medhi', coSinger: 'Mahalakshmi Iyer',
      categories: ['film', 'love'],
      yt: 'q9Kc6sjIx7s', source: 'https://www.youtube.com/watch?v=q9Kc6sjIx7s',
      sourceLabel: 'Heritage Jhankar (official YouTube channel)',
      rightsStatus: 'Official channel upload', verified: true,
      note: 'Title song of the 1999 Assamese film.'
    },
    {
      id: 'janu-janu', title: 'Janu Janu', album: null, film: null, year: null,
      language: 'Assamese', kind: 'single', composedBy: 'Zubeen Garg', coSinger: 'Parineeta B',
      categories: ['love', 'energetic'],
      yt: 'zrY2Mw8Zpaw', source: 'https://www.youtube.com/watch?v=zrY2Mw8Zpaw',
      sourceLabel: 'Times Music Axom (official YouTube channel)',
      rightsStatus: 'Official label upload', verified: true, note: null
    },
    {
      id: 'keuphale', title: 'Keuphale Gujori Gumori', album: 'Hiyamon', film: null, year: null,
      language: 'Assamese', kind: 'album', composedBy: 'Zubeen Garg', coSinger: null,
      categories: ['feeling'],
      yt: 'd_qQhEpN0b0', source: 'https://www.youtube.com/watch?v=d_qQhEpN0b0',
      sourceLabel: 'N.K. Production (official YouTube channel)',
      rightsStatus: 'Official channel upload', verified: true,
      note: 'Lyrics: Diganta Bharati.'
    },
    /* ── link-only songs (no verified embeddable source yet) ───── */
    {
      id: 'jag-lal-lal', title: 'Jag Lal Lal Lal', album: null, film: 'Big Brother', year: 2007,
      language: 'Hindi', kind: 'film', composedBy: null, coSinger: 'Ustad Sultan Khan',
      categories: ['energetic'],
      yt: null,
      source: 'https://www.youtube.com/results?search_query=Zubeen+Garg+Jag+Lal+Lal+Big+Brother',
      sourceLabel: 'Listen on YouTube',
      rightsStatus: 'No verified official embed — official platform link only', verified: true,
      note: 'A 2007 collaboration with Ustad Sultan Khan.'
    },
    {
      id: 'o-mon-bolaka', title: 'O Mon Bolaka', album: null, film: 'Mon', year: 2003,
      language: 'Bengali', kind: 'film', composedBy: null, coSinger: null,
      categories: ['film', 'love'],
      yt: null,
      source: 'https://www.youtube.com/results?search_query=O+Mon+Bolaka+Zubeen+Garg+Mon',
      sourceLabel: 'Listen on YouTube',
      rightsStatus: 'No verified official embed — official platform link only', verified: true,
      note: 'One of two songs he sang for the Bengali film "Mon" (2003).'
    },
    {
      id: 'piya-re', title: 'Piya Re Piya Re', album: null, film: 'Chirodini Tumi Je Amaar', year: 2008,
      language: 'Bengali', kind: 'film', composedBy: null, coSinger: null,
      categories: ['film', 'love'],
      yt: null,
      source: 'https://www.youtube.com/results?search_query=Piya+Re+Piya+Re+Chirodini+Tumi+Je+Amar+Zubeen',
      sourceLabel: 'Listen on YouTube',
      rightsStatus: 'No verified official embed — official platform link only', verified: true, note: null
    },
    {
      id: 'politics-nokoriba', title: 'Politics Nokoriba Bandhu', album: null, film: null, year: null,
      language: 'Assamese', kind: 'single', composedBy: 'Zubeen Garg', coSinger: null,
      categories: ['energetic', 'memory'],
      yt: null,
      source: 'https://www.youtube.com/results?search_query=Politics+Nokoriba+Bandhu+Zubeen+Garg',
      sourceLabel: 'Listen on YouTube',
      rightsStatus: 'No verified official embed — official platform link only', verified: true,
      note: 'Widely adopted as an anthem of dissent — a song of his disillusionment with corrupt politics.'
    },
    {
      id: 'nibir-junaki-rati', title: 'Nibir Junaki Rati', album: 'Sopunor Sur', film: null, year: 1992,
      language: 'Assamese', kind: 'album', composedBy: 'Zubeen Garg', coSinger: null,
      categories: ['calm', 'feeling'],
      yt: null,
      source: 'https://open.spotify.com/track/58wgorU83LoOsroIP7tPBO',
      sourceLabel: 'Listen on Spotify',
      rightsStatus: 'Official streaming platform', verified: true, note: null
    },
    {
      id: 'sopunore-pokhi', title: 'Sopunore Pokhi', album: 'Sopunor Sur', film: null, year: 1992,
      language: 'Assamese', kind: 'album', composedBy: 'Zubeen Garg', coSinger: 'Sabita Sharma',
      categories: ['calm'],
      yt: null,
      source: 'https://open.spotify.com/track/1XacVfJzBHZCZe56o4QSZc',
      sourceLabel: 'Listen on Spotify',
      rightsStatus: 'Official streaming platform', verified: true, note: null
    },
    {
      id: 'bihure-boliya-mon', title: 'Bihure Boliya Mon', album: 'Sopunor Sur', film: null, year: 1992,
      language: 'Assamese', kind: 'album', composedBy: 'Zubeen Garg', coSinger: 'Swaswati Phukan',
      categories: ['bihu'],
      yt: null,
      source: 'https://www.youtube.com/results?search_query=Bihure+Boliya+Mon+Zubeen+Garg',
      sourceLabel: 'Listen on YouTube',
      rightsStatus: 'No verified official embed — official platform link only', verified: true, note: null
    }
  ],

  /* ── LISTENING CATEGORIES (editorial only) ──────────────────────── */
  categories: [
    { id: 'love',       icon: '❤️', name: 'ভালপোৱাৰ সুৰ', desc: 'Songs of love and longing.' },
    { id: 'feeling',    icon: '🌧️', name: 'অনুভৱৰ সুৰ', desc: 'Songs that carry feeling.' },
    { id: 'bihu',       icon: '🌾', name: 'বিহুৰ সুৰ', desc: 'The festive rhythm of Bihu.' },
    { id: 'film',       icon: '🎬', name: 'চলচ্চিত্ৰৰ সুৰ', desc: 'Songs from the films he sang for.' },
    { id: 'energetic',  icon: '🔥', name: 'উদ্দীপনাময় সুৰ', desc: 'Songs full of energy.' },
    { id: 'calm',       icon: '🌙', name: 'শান্ত সুৰ', desc: 'Quiet, gentle melodies.' },
    { id: 'memory',     icon: '🕊️', name: 'স্মৃতিৰ সুৰ', desc: 'Songs we return to, to remember him.' }
  ],

  /* ── ALBUMS (verified years from documented discography) ────────── */
  albums: [
    { title: 'Anamika', year: 1992, language: 'Assamese', type: 'album', note: 'Debut solo album (N.K. Production).', source: 'https://www.youtube.com/watch?v=FrQxbbNPgg8' },
    { title: 'Sopunor Sur', year: 1992, language: 'Assamese', type: 'album', note: null, source: 'https://www.youtube.com/watch?v=HCkQf_EWA60' },
    { title: 'Junaki Mon', year: 1993, language: 'Assamese', type: 'album', note: null, source: 'https://www.youtube.com/watch?v=ONWV0Mjwryk' },
    { title: 'Maya', year: 1994, language: 'Assamese', type: 'album', note: null, source: null },
    { title: 'Asha', year: 1995, language: 'Assamese', type: 'album', note: null, source: null },
    { title: 'Ujan Piriti', year: 1995, language: 'Assamese', type: 'bihu', note: 'His first Bihu album — a commercial success.', source: null },
    { title: 'Chandni Raat', year: 1995, language: 'Hindi', type: 'indipop', note: 'First Indipop solo album, released after moving to Mumbai.', source: null },
    { title: 'Mukti', year: 1997, language: 'Assamese', type: 'album', note: 'Sibling pop-duo album with his sister Jonkie Borthakur.', source: null },
    { title: 'Surer Upahar', year: 1997, language: 'Bengali', type: 'album', note: 'His first Bengali album.', source: null },
    { title: 'Snigdha Jonak', year: 1998, language: 'Assamese', type: 'album', note: null, source: null },
    { title: 'Jaanmoni', year: 1998, language: 'Assamese', type: 'album', note: null, source: null },
    { title: 'Yuhi Kabhi', year: 1998, language: 'Hindi', type: 'indipop', note: 'Second Indipop album; its music video aired on Channel V.', source: null },
    { title: 'Sishu', year: 2002, language: 'Assamese', type: 'album', note: 'The last sibling-duo album with Jonkie — released after her passing, and dedicated to her.', source: null },
    { title: 'Anjana', year: 2003, language: 'Assamese', type: 'album', note: 'With Manas Robin.', source: null },
    { title: 'Zindagi', year: 2007, language: 'Hindi', type: 'indipop', note: 'Released 29 August 2007.', source: null }
  ],

  /* ── FILMS (acting / directing — verified) ─────────────────────── */
  films: [
    { title: 'Tumi Mor Matho Mor', year: 2000, role: ['Actor', 'Director'], note: 'His debut as actor and director (N.K. Production).' },
    { title: 'Prem Aru Prem', year: 2002, role: ['Actor'], note: null },
    { title: 'Dinabandhu', year: 2004, role: ['Actor'], note: null },
    { title: 'Mon Jaai', year: 2008, role: ['Actor'], note: null },
    { title: 'Bhal Pabo Najanilu', year: 2013, role: ['Actor'], note: null },
    { title: 'Gaane Ki Aane', year: 2016, role: ['Actor'], note: null },
    { title: 'Mission China', year: 2017, role: ['Actor', 'Director'], note: null },
    { title: 'Priyaar Priyo', year: 2017, role: ['Actor'], note: null },
    { title: 'The Underworld', year: 2018, role: ['Actor'], note: null },
    { title: 'Kanchanjangha', year: 2019, role: ['Actor'], note: 'A film that took on the issue of corruption in APSC recruitment.' },
    { title: 'Rajneeti', year: 2022, role: ['Actor'], note: null },
    { title: 'Dr. Bezbaruah 2', year: 2023, role: ['Actor'], note: null },
    { title: 'Sikaar', year: 2024, role: ['Actor'], note: null },
    { title: 'Roi Roi Binale', year: 2025, role: ['Actor'], note: null }
  ],
  filmTabs: ['Actor', 'Singer', 'Composer', 'Music Director', 'Film Music'],
  filmTabNote: {
    'Singer': 'Selected verified film songs appear in the Music Library. A complete verified film-song list is still being compiled.',
    'Composer': 'He composed roughly 2,000 songs (registered with IPRS) — a verified full composer list is still being compiled.',
    'Music Director': 'Verified: music director of the Bengali film "Shudhu Tumi" (2004). Further credits are being verified.',
    'Film Music': 'Film-soundtrack credits beyond those listed are being verified before publication.'
  },

  /* ── TIMELINE (verified) ───────────────────────────────────────── */
  timeline: [
    { year: '1972', title: 'জন্ম · টুৰা, মেঘালয়', text: 'Born on 18 November 1972 in Tura, Meghalaya, to Mohini Mohon Borthakur — a magistrate, poet and lyricist — and Ily Borthakur, a singer. Named in homage to Zubin Mehta.' },
    { year: '1970s–80s', title: 'প্ৰাৰম্ভিক জীৱন · যোৰহাট', text: 'Raised in Jorhat, Assam. Began singing at the age of three, first taught by his mother. Learnt tabla from Pandit Robin Banerjee for eleven years, and Assamese folk music from Guru Ramani Rai.' },
    { year: '1992', title: 'Anamika — অভিষেক', text: 'Debut Assamese solo album "Anamika" (N.K. Production) was released, recognised as a trendsetter for blending Western and regional influences. The same year he won a gold medal for a western solo performance at a youth festival.' },
    { year: '1995', title: 'মুম্বাইলৈ যাত্ৰা', text: 'Moved to Mumbai. Released his first Indipop solo album "Chandni Raat" and his first Bihu album "Ujan Piriti", a commercial success.' },
    { year: '1997–98', title: 'বাংলা আৰু ইণ্ডিপপ', text: 'Entered the Bengali music industry with "Surer Upahar" (1997). The sibling-duo album "Mukti" (1997) with sister Jonkie. Second Indipop album "Yuhi Kabhi" (1998) — his first music video on Channel V.' },
    { year: '2000', title: 'চলচ্চিত্ৰত অভিষেক', text: 'Debut as actor and director with the Assamese film "Tumi Mor Matho Mor" (N.K. Production).' },
    { year: '2003', title: 'বাংলা চলচ্চিত্ৰ · Mon', text: 'Sang "O Mon Bolaka" and "Abhilashi Mone" for the Bengali film "Mon". The Assamese album "Anjana" (with Manas Robin) was also released.' },
    { year: '2006', title: 'Ya Ali — ৰাষ্ট্ৰীয় স্বীকৃতি', text: '"Ya Ali" from Gangster, composed by Pritam, became his biggest Bollywood breakthrough and won him Best Playback Singer at the Global Indian Film Awards (2006).' },
    { year: '2007–08', title: 'অবিৰত সৃষ্টি', text: 'Hindi album "Zindagi" (2007), collaboration with Ustad Sultan Khan on "Jag Lal Lal Lal" (Big Brother), and a run of Bengali hits including "Piya Re Piya Re" (Chirodini Tumi Je Amaar, 2008).' },
    { year: '2013–19', title: 'চলচ্চিত্ৰ নিৰ্মাণ', text: 'Acted and directed across Assamese cinema — Bhal Pabo Najanilu (2013), Mission China (2017, director), The Underworld (2018), Kanchanjangha (2019) — preferring realism and political themes over conventional narratives.' },
    { year: '2020–21', title: 'মানৱীয় কাৰ্য', text: 'A non-political voice during the Anti-CAA protests in Assam. In May 2021, during Assam\'s COVID-19 surge, he offered his two-storey Guwahati house to be converted into a COVID Care Centre. His Kalaguru Artiste Foundation donated to flood relief and other causes.' },
    { year: '2022–25', title: 'শেষ পৰ্য্যায়', text: 'Continued acting across Assamese cinema — Rajneeti (2022), Dr. Bezbaruah 2 (2023), Sikaar (2024), Roi Roi Binale (2025) — across a career reported at more than 40,000 recorded songs in some 40 languages and dialects.' },
    { year: '2025', title: 'বিদায়', text: 'Passed away on 19 September 2025 in Singapore, aged 52. He lay in state in Guwahati for public tributes, and was cremated with full state honours and a 21-gun salute on 23 September. Assam announced memorial plans in Jorhat and Guwahati.' }
  ],

  /* ── LEGACY THEMES (verified) ──────────────────────────────────── */
  legacy: [
    { icon: '🎵', title: 'Music', text: 'A career spanning 33 years, reported at more than 40,000 recorded songs across Assamese, Bengali, Hindi and many languages and dialects of Northeast India.' },
    { icon: '🎬', title: 'Cinema', text: 'Actor, director and filmmaker of Assamese cinema — drawn to realism, youth idealism, Assamese identity and social change.' },
    { icon: '🌾', title: 'Assamese culture', text: 'Recognised as one of the most influential musicians in Assam — blending Western and folk traditions, and credited with contributing to the revival of traditional Assamese music.' },
    { icon: '❤️', title: 'Humanitarian contribution', text: 'His Kalaguru Artiste Foundation worked for flood relief, medicines and public causes; he offered his own house as a COVID Care Centre in 2021.' },
    { icon: '🌏', title: 'Northeast', text: 'Collaborated with nearly 250 tribal communities across Assam, learning and preserving thousands of traditional folk songs.' },
    { icon: '👥', title: 'Influence on younger generations', text: 'Since Anamika (1992), regarded as a trendsetter whose voice and fearlessness shaped generations of young artists across the Northeast.' }
  ],

  /* ── ARTICLES (verified topics) ────────────────────────────────── */
  articles: [
    {
      title: 'Ya Ali — the song that carried Assam\'s voice to all of India',
      snippet: 'In 2006, "Ya Ali" from the film Gangster — composed by Pritam, sung by Zubeen Garg — became a national phenomenon and won him Best Playback Singer at the Global Indian Film Awards. Yet he did not fully move into mainstream Bollywood playback; he famously turned down many offers rather than be typecast.',
      tag: 'Music'
    },
    {
      title: 'A voice in forty languages',
      snippet: 'Over a 33-year career, Zubeen Garg was reported to have recorded more than 40,000 songs in an estimated 40 languages and dialects — from Assamese, Bengali and Hindi to Boro, Karbi, Mising, Tiwa, Goalpariya and many more.',
      tag: 'Music'
    },
    {
      title: 'The folk archivist',
      snippet: 'Beyond his own songs, he collaborated with nearly 250 tribal communities across Assam, learning and preserving thousands of traditional folk songs — oi nitoms of the Misings, Borgeet, lokgeet, Zikir and Bihu songs alike.',
      tag: 'Culture'
    },
    {
      title: 'Music as conscience',
      snippet: 'From albums like Mukti and Sishu to the widely-adopted protest song "Politics Nokoriba Bandhu", his art carried themes of dissent and social honesty. He was a prominent non-political voice in Assam\'s Anti-CAA protests.',
      tag: 'Culture'
    },
    {
      title: 'A house that became a COVID ward',
      snippet: 'In May 2021, as Assam battled a devastating COVID-19 surge, he offered his two-storey house in Guwahati to be converted into a COVID Care Centre — one quiet act among many through his Kalaguru Artiste Foundation.',
      tag: 'Remembered'
    }
  ],

  /* ── ARCHIVE categories (honest completeness states) ──────────── */
  archive: [
    { icon: '🎵', name: 'Music', count: null, status: 'Curated verified collection available in the Music Library.' },
    { icon: '💿', name: 'Albums', count: null, status: 'A verified selection of documented albums is listed. The full discography is still being compiled.' },
    { icon: '🎬', name: 'Films', count: null, status: 'Verified acting/directing filmography is listed under Cinema.' },
    { icon: '🎤', name: 'Performances', count: 0, status: 'This collection is not ready yet. Only legally reusable or officially embedded performances will be published here.' },
    { icon: '🎙', name: 'Interviews', count: 0, status: 'This collection is not ready yet. Only authorized sources will be published here.' },
    { icon: '📸', name: 'Photos', count: 0, status: 'This collection is not ready yet. Only licensed or permission-based photographs will be published here.' },
    { icon: '📜', name: 'Historical records', count: 0, status: 'This collection is being compiled from verified public records.' },
    { icon: '📰', name: 'Articles', count: null, status: 'A small set of verified articles is available under "জুবিন দাৰ কথা".' }
  ]
};
