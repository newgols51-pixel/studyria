#!/usr/bin/env python3
"""
admin-app build script - extracts the Studyria Admin Console from the
main index.html into the standalone admin-app/ folder.

MECHANICAL EXTRACTION - no rewriting of business logic:
  1. js/admin-console-inline.js  <- index.html lines 26484-39968 (verbatim)
                                   + renderAdminReviews block (verbatim)
  2. css/admin-base.css          <- index.html lines 545-5643 (verbatim)
                                   (design tokens + base components + admin styles)
  3. partials/icons.html         <- index.html lines 9067-9100 (SVG sprite)
  4. partials/login.html         <- index.html lines 15746-15793 (login page)
  5. js/modules/*.js             <- verbatim copies of the admin module files
                                   (same files the public site lazy-loads for its
                                    admin route; see ROUTE_SCRIPTS['admin'])

Re-run this script any time the main-site admin code changes, then commit.
After final cutover (see README.md), the root copies retire.

Idempotent: safe to run repeatedly; output is always freshly regenerated.
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
MAIN = os.path.join(ROOT, 'index.html')
APP  = os.path.join(ROOT, 'admin-app')

def lines_of(path, a, b):  # 1-indexed inclusive
    with open(path, encoding='utf-8') as f:
        return ''.join(f.readlines()[a-1:b])

def write(rel, content):
    p = os.path.join(APP, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content)
    print('  OK', rel, '(%d lines)' % len(content.splitlines()))

# -- 1. inline admin console JS ------------------------------------------
js = lines_of(MAIN, 26484, 39873)
js += '\n' + lines_of(MAIN, 44667, 44710) + '\n'   # renderAdminReviews
write('js/admin-console-inline.js', js)

# -- 2. base CSS (tokens, components, admin styles) ----------------------
write('css/admin-base.css', lines_of(MAIN, 545, 5643))

# -- 3. icon sprite ------------------------------------------------------
write('partials/icons.html', lines_of(MAIN, 9067, 9100))

# -- 4. login page markup (verbatim) -------------------------------------
write('partials/login.html', lines_of(MAIN, 15746, 15793))
write('partials/console.html', lines_of(MAIN, 15795, 16071))

# -- 5. admin module files (verbatim copies) ------------------------------
MODULES = [
    'brainlab-exam-import.js', 'smart-publish-manager.js',
    'pdf-classification-refactor.js', 'premium-edit-pdf-ui.js',
    'admin-membership-manager.js', 'pwa-admin-v32.js',
    'library-expansion-uploader.js', 'campus-admin.js',
    'zubeen-legacy-admin.js', 'brainlab-admin-tests.js',
    'question-bank.js',
    'vfa-practice-pool.js', 'vfa-practice-pool-b2.js', 'vfa-practice-pool-b3.js',
    'vfa-practice-pool-b4.js', 'vfa-practice-pool-b5.js',
    'adre-road-transport-pool.js', 'si-history-practice-pool-b1.js',
    'tet-practice-pool-b1.js',
    'career-hub-poster-engine.js', 'cloud-manager.js', 'pass-management.js', 'website-customization.js',
    'studyria-notifications.js',
]
for m in MODULES:
    src = os.path.join(ROOT, m)
    if not os.path.exists(src):
        print('  MISSING SOURCE: %s' % m); sys.exit(1)
    write('js/modules/' + m, open(src, encoding='utf-8').read())

src = os.path.join(ROOT, 'cloud-manager.css')
write('css/cloud-manager.css', open(src, encoding='utf-8').read())

print('\nDone. Shell files (index.html, admin-boot.js, admin-shell.css) are hand-maintained.')
