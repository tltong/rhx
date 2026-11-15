Student news vocabulary
=======================

Each grade document in the existing `newsConfig` collection accepts
`vocabularyCount` (integer 0..50). Defaults are 3 for Primary 1–2, 5 for Primary
3–4, 8 for Primary 5–6 and 10 for Secondary. Missing fields in older documents
read as those defaults; saves retain the existing single-collection, atomic
configuration flow. Zero disables highlighting and meaning requests.

Vocabulary settings stay outside the article text/image identity. Changing the
count creates/reuses a different vocabulary set without rewriting text,
regenerating images or consuming another daily article. The grade configuration
editor includes the count for every grade.

New editions prepare vocabulary after text and before images/readiness. Older
pooled editions and completed private previews backfill on demand. Both paths
call DeepSeek through `utils/llm/llm_ops.generateLlmText`. That same selection
request prepares an `articleMeaning` for every selected item, in the article's
own language and at the student's grade. Other-language meaning generation uses
the same utility and provider on demand. Words and short phrases are allowed. Selection
may contain fewer items than the configured target. Zero counts and articles
without story text skip paid vocabulary selection.

The backend validates that terms occur in actual page text, finds the first
whole-word/phrase occurrence across the article, removes duplicates and
conflicting overlaps, and computes page positions and UTF-16 offsets (end
exclusive). Chinese expressions can match inside continuous text; alphabetic
terms cannot match inside a longer word. Context comes from the surrounding
source sentence, never from model-supplied offsets or context.

Storage follows the agreed schema:

* `newsConfig/grade_{level}_{standard}` adds `vocabularyCount`.
* `newsEditions/{editionId}/vocabulary/{setId}` stores ready immutable items,
  requested/actual counts, selector version, original grade/language, each item's
  precomputed `articleMeaning`, and creation
  time. `setId` hashes the selector version and requested count.
* Its `meanings/{meaningId}` subcollection caches a grade-appropriate contextual
  definition for a selected term and meaning language. `meaningId` hashes the
  meaning version, term ID and normalized target language.
* `studentNews/{uid}` adds `lastMeaningLanguage` and `lastMeaningLanguageAt`,
  merged without changing timezone, daily slots or history.
* Existing `newsGenerations` handles `vocabulary` and `meaning` work. Artifact
  writes and job completion use the same fenced transaction, so a stale worker
  cannot publish a result after losing its lease.

Unpublished preview editions can have vocabulary children before their parent
edition is published; these do not place the article in the pool. The backend
requires the requesting administrator to own the completed preview. Student
requests require an edition already pinned to that student's daily assignment.
Clients cannot choose arbitrary edition IDs, other students, counts, context or
terms. Direct Firestore access to the cache and preferences remains denied.
Publication of the article makes its already-prepared vocabulary/meanings
available to authorized students of that exact edition.

The `studentNews` callable adds:

| Action | Input | Behaviour |
| --- | --- | --- |
| `getNewsVocabulary` | Article reference, optional `retry: true` | Return cached items or enqueue/recover selection; explicit retry resumes a failed job |
| `requestNewsMeaning` | Article reference, `setId`, `termId`, `meaningLanguage` | Validate a selected item/language, remember the choice and prepare/reuse the shared meaning |
| `getNewsMeaning` | Same meaning reference | Poll an existing request without changing language preference or starting new paid work |

Article-language meaning lookups return the inline prepared definition without
reading/creating a meaning job or calling the provider. Vocabulary selector
version 2 introduced these definitions. Version 3 asks for the simplest possible
explanation: familiar everyday words, the fewest words needed and one short
sentence, without jargon, harder synonyms or circular definitions. This applies
to both article-language definitions and on-demand other-language meanings.
The meaning cache version is now 2. Legacy selection/meaning caches remain
intact while the next read prepares the current version before exposing
highlights. Article text/images and comprehension attempts are reused.

An article reference is exactly one of:

```js
{previewGenerationId: "owned-completed-preview"}
{assignmentId: "2026-11-14_international", articleLanguage: "English"}
```

Clicking a highlighted item immediately displays its prepared article-language
definition. A separate section below offers other Syllabus Scope languages,
with the last chosen alternative first and all other alternatives available.
The source language is already visible above, so it is omitted from the
alternative-language selector. Clicking a word does not make a meaning API/LLM
request or change the preference. Translations remain on demand and do not
replace the visible article-language definition. Cached meanings are specific to the edition, vocabulary set,
term/context and target language; another article's use of the same word has its
own meaning.

The shared browser component at
`public/features/student_news/pages/common/news_vocabulary.js` renders plain text
with inline word buttons and an accessible meaning dialog. It accepts either
article reference above. The admin preview integrates this component; student
reader screens can use the same component and authenticated APIs. It preserves
article text verbatim, highlights only first occurrences, shows only the
meaning immediately, keeps that definition above the alternative-language
controls and their results, keeps language choices available while loading, and ignores stale
responses after switching articles/languages. Meaning-selection requests are
serialized so an older slow request cannot overwrite a later preference.

Verification:

```sh
node functions/features/news_article_generator/news_vocabulary.test.js
node public/features/student_news/news_config.test.mjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node functions/features/student_news/news_vocabulary_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node functions/features/student_news/news_backend_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node functions/features/student_news/news_config_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node scripts/test-news-preview-browser.cjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node scripts/test-news-config-browser.cjs
```

These tests use demo projects and mocked paid providers. They cover shared-cache
races, student/preview ownership, source integrity and script-safe rendering,
first occurrences across pages, Unicode offsets, contextual definitions, cached
reads, preferences, rapid changes, lost responses, disabled vocabulary,
backfilling, failed-job recovery and unchanged article/image generation.

Deployed to `readyherox` on 2026-11-14, verified at 12:22 UTC: updated
`onNewsGenerationRequested`, `studentNews` and Hosting. Forty-four unit checks,
six Firestore emulator scenarios and both Chrome flows passed. Eleven published
news/configuration assets matched the workspace, and the deployed callable
rejected unauthenticated access. A live existing private Bahasa Melayu preview
received three vocabulary items with verified offsets, followed by a contextual
English meaning through DeepSeek. Subsequent requests reused the ready caches.
The article text and images were not regenerated, and it remained private.

Article-language meanings update deployed on 2026-11-14, verified at 12:57 UTC:
updated `onNewsGenerationRequested`, `studentNews` and Hosting. Thirty-three
unit checks, five Firestore emulator scenarios and the Chrome preview flow
passed. Desktop/mobile checks confirmed the first click makes no meaning API
request and keeps the source definition above other-language controls/results.
Eleven published assets matched the workspace; the callable still required
sign-in. An existing private Bahasa Melayu preview received a version-2 set
with three contextual article-language definitions through DeepSeek. Repeated
reads reused the ready set, and article-language meaning lookups returned the
inline definition with no provider request. Its article content remained
unchanged and the preview remained private.
