Student news configuration
==========================

The configuration portion of news lives in the `student_news` feature. Site
Admin → Others → News Configuration edits shared prompts, article-type image
settings, and the twelve primary/secondary grade settings. Available languages
are read from Syllabus Scope and displayed as a read-only list.

All documents are in one Firestore collection, `newsConfig`:

| Document | Contents |
| --- | --- |
| `settings` | Common/discovery instructions, word defaults, default text-page count, aggregate revision |
| `type_standardArticle`, `type_multiPageArticle`, `type_pictureStory` | Image count and `web`/`ai` choice |
| `grade_primary_1` through `grade_primary_6`, and `grade_secondary_1` through `grade_secondary_6` | One format, grade instructions, nullable word/page overrides, vocabulary count, question answer mode |

An empty collection reads as defaults without a write. Defaults are 400 total
words for standard and multiple-page articles, 50 for picture stories, and four
pages for multiple-page text articles. Primary grades 1–2 start with picture
stories, 3–4 with multiple-page articles, and 5–6 with standard articles. Secondary
grades start with standard articles. Initial image settings are one web photo
for standard articles, four web photos for multiple-page articles, and five AI
illustrations for picture stories. Admins can change every grade's choice.

Each grade also has a configurable `vocabularyCount` (0..50). Defaults are 3 for
Primary 1–2, 5 for Primary 3–4, 8 for Primary 5–6 and 10 for Secondary; zero
disables highlights. Older documents read these defaults without a migration.
See `docs/student-news-vocabulary.md` for selection, shared meanings and the
last-language preference.

Each grade's `questionAnswerMode` selects `typed` or `word_bank` for the three
comprehension questions. Primary 1–4 default to a shared word bank; other grades
default to typed answers. Legacy documents inherit those defaults. The mode is
frozen per assignment/preview and does not invalidate article or image caches.
See `docs/student-news-questions.md` for generation, marking and review.

Languages use the existing `listSyllabusScopeLanguages()` feature API: languages
across all Syllabus Scope documents are trimmed, deduplicated case-insensitively,
and sorted. Each configuration read/save returns this derived `supportedLanguages`
list. It is not stored in `newsConfig`; legacy copied lists and values submitted
by old clients are ignored and removed on the next news-configuration save. Scope
changes require no news-configuration save. The Refresh Languages action updates
only the displayed list, preserving unsaved fields and their original revision
so concurrent-save protection continues to work. An empty source displays a
message linking to Syllabus Scope; it does not invent an English fallback or
prevent editing other news settings. A failed source lookup reports an error;
save reads languages before committing so a lookup failure cannot hide a
successful configuration write.

Blank grade word/page overrides inherit defaults; zero words explicitly means
pictures only. Standard articles have one page. Picture stories require at least
one image, and their page count equals their image count. Only multiple-page text
articles accept a separate page override. Other formats accept zero images.
Word targets are bounded at 10,000, pages at 20, and images at 12. Targets count
the story body across all pages, including picture captions, rather than credits
or interface labels. They are generation targets, not an exact-length guarantee.

The web-photo policy is fixed: two attempts, followed by a complete AI image set
if the required count cannot be met, without mixing web and AI images. The form
describes this policy; this configuration phase makes no paid generation calls.
There are no outlet lists, topic-filter controls, or manual article editors.

Backend entry point: `functions/features/student_news/student_news_module.js`.
Browser entry point: `public/features/student_news/student_news_module.js`.
Mirrored schema declarations live in `functions/schema/student_news_config_schema.js`
and `public/config/firebase/student_news_config_schema.js`.

`getNewsConfiguration()` requires sign-in and returns the complete configuration
plus `version`. `saveNewsConfiguration({...configuration, expectedVersion})`
requires a currently verified, enabled Firebase account listed in Site Admin.
Saving atomically writes all sixteen documents and increments the aggregate
revision. A concurrent/stale save returns `aborted` and leaves the editor's draft
intact. Each document receives backend-owned version, UID and timestamp metadata.
A partially missing or inconsistent saved collection fails explicitly instead
of silently replacing a grade's settings with defaults.

The `studentNews` callable exposes these configuration actions alongside the
news operations described in `docs/student-news-backend.md`. Browser Firestore
writes are denied even to administrators, including through the general fallback
rule. Signed-in reads match existing configuration access. Trusted future backend
generation can use `loadNewsConfiguration()` and `getEffectiveNewsGradeSettings()`.
The pure `resolveNewsGradeSettings()` helper combines common and grade prompts
with resolved numeric/image settings without calling a model or selecting news.

Verification uses local isolated `demo-*` projects and mocked auth transports:

```sh
node public/features/student_news/news_config.test.mjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node functions/features/student_news/news_config_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node scripts/test-news-config-browser.cjs
```

These cover defaults, inheritance, explicit zero, invalid counts and formats,
current account authorization, stale/concurrent saves, one-collection persistence,
Firestore rules, scope-derived languages and refresh, legacy-language removal,
browser load/save failures, reloads, and responsive layout.

Deployment uses the existing wrapper, publishing the callable, then rules,
then Hosting:

```sh
bash scripts/deploy-firebase.sh function studentNews
bash scripts/deploy-firebase.sh firestore-rules
bash scripts/deploy-firebase.sh hosting
```

Deployed to Firebase project `readyherox` on 14 November 2026. The
`studentNews` Node.js 22 callable was created in `us-central1`, the rules were
compiled and released to `cloud.firestore`, and Hosting was released successfully.
Verification completed at 06:15 UTC: all seven configuration/navigation assets
matched their local SHA-256 hashes, and an unauthenticated configuration request
returned HTTP 401 with `UNAUTHENTICATED`. Deployment does not seed configuration
or invoke news/image generation.

Published admin page:
`https://readyherox.web.app/features/student_news/pages/admin/news_admin.html`.
Access it through Site Admin → Others → News Configuration with a site-admin
account.

The Syllabus Scope language integration was deployed on 14 November 2026 at
06:32 UTC by updating `studentNews` and Hosting. The published configuration
assets again matched local hashes, and the callable's unauthenticated request
continued to return HTTP 401. Emulator and Chrome checks covered scope edits,
deduplication, empty language lists, legacy copied lists, refresh without losing
edits, and stale-save protection after refresh.
