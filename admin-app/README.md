# Studyria Admin — Standalone Operations Console

Genuinely separate deployment of the Studyria admin console (chosen target:
`admin.studyria.qzz.io`), built by **mechanical extraction** from the
production site — no second engine, no duplicated business logic, no
changes to the public website.

## What this is
- Same Supabase project / auth / `admin_users` authorization / RLS policies
  as the public site (the ONLY source of truth for admin identity).
- Same admin modules (verbatim copies of the files the public site
  lazy-loads for its admin route) + the same inline admin console code
  extracted verbatim from `index.html`.
- Separate PWA identity: dedicated ADMIN logo, icons and manifest.

## Structure
- `build-from-main.py` — re-extracts everything from `index.html` + root
  modules. **Run it before each deploy** so the copies can never drift.
- `js/admin-console-inline.js` — the admin console JS (verbatim).
- `js/modules/` — verbatim copies of the admin module files.
- `js/admin-boot.js` — shell boot: Supabase client init, `navigate()`
  shim, `showToast`, session hardening (re-validates `admin_users` on
  every boot before the console can render).
- `css/admin-base.css` — extracted design system (tokens + components).
- `css/admin-shell.css` — shell additions: mobile drawer, admin logo.
- `partials/` — generated raw extractions (reference).
- `tests/admin-app-tests.js` — node test suite (`node tests/admin-app-tests.js`).

## Deploy (Cloudflare Pages — remaining step)
1. Commit + push `admin-app/` (the public site is untouched; the folder is
   also reachable at `studyria.qzz.io/admin-app/` for staging).
2. Cloudflare Dashboard → Workers & Pages → Create → Pages →
   **Connect to Git** → select the Studyria repo →
   **Root directory: `admin-app`** → Framework preset: None → Save & Deploy.
3. Custom domains → Set up custom domain → `admin.studyria.qzz.io`
   (adds the CNAME to the Pages project automatically for a qzz.io zone
   hosted in the same Cloudflare account).
4. Verify: `https://admin.studyria.qzz.io` shows the login gate.

## Known production-parity notes (honest status quo)
- `header-manager`, `nav-manager`, `home-layout-manager` tabs have NO
  renderer anywhere in production (dead tabs → honest "planned" badge).
- Sidebar "Smart Publish" button is wired to the real Smart Publish
  workflow, which lives inside the *Add New PDF* tab (`renderAdminAddPDF`
  contains the sbp queue + mobile editor). In production the standalone
  tab was a dead end ("Section coming soon").
- `sbpHideEditor()` has a pre-existing latent reference (undefined) also
  present in production; behavior is identical.
- Public site keeps its existing admin portal until this app is verified;
  cutover (removing the root copies) happens only after owner sign-off.
