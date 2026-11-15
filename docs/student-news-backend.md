Student news backend and admin preview
======================================

Vocabulary highlighting, per-grade counts, shared contextual meanings and the
last-language preference are described in `docs/student-news-vocabulary.md`.
The three comprehension questions, per-grade answer modes, one final submission
and translated reviews are described in `docs/student-news-questions.md`.

The News Configuration admin page now has a Generate and Preview News section
at the bottom. Choose international/local news, a country for local news, a grade,
a Syllabus Scope language, and either a new story or an existing pooled story.
Generation uses saved settings; unsaved configuration changes disable the
Generate button. The preview shows pages, images, original publication date, and
clickable sources. Images remain labelled as generated illustrations or
representative web photos, with attribution, licence and source links.

After generation, the Article language selector switches the same preview
between Syllabus Scope languages. A missing version generates text using the
original preview's frozen settings, page layout and complete image set, even
before the story enters the pool. The previous version remains readable while
preparing another language. Prepared languages are cached per original preview;
switching back reuses them without another LLM request. Interrupted requests
retry the same deterministic job. The current page is retained across languages.
Each language version is added to the pool explicitly with Add to Pool.

A generated preview is private to the administrator who requested it. It does
not create pooled stories or editions. Add to Pool publishes the server's saved
preview, without accepting editable article data from the browser. Repeating
that action is idempotent. Generating another edition of a pooled story preserves
its underlying facts. An edition regenerated with the same settings becomes the
latest reusable edition after publication; existing student assignments keep
their original edition IDs.

The backend features are `news_article` (stories, editions, media and pool
storage), `news_article_generator` (providers and resumable preparation), and
`student_news` (configuration, authenticated operations, and student daily state).
Schema declarations live in `functions/schema/student_news_schema.js` and its
browser mirror. News configuration retains its existing single collection.

The added backend actions on the `studentNews` callable are:

| Action | Input / behaviour |
| --- | --- |
| `getNewsPreviewOptions` | Administrator only; countries and languages from Syllabus Scope |
| `generateNewsPreview` | Category, country, level, standard, language, optional pooled story ID, client request ID |
| `getNewsPreview` | Owner administrator's generation status, progress and completed public article |
| `requestNewsPreviewLanguage` | Owner preview ID and Syllabus Scope language; prepare/reuse a private language version with the original images and settings |
| `retryNewsPreview` | Resume the same owner's failed/stale job |
| `addNewsPreviewToPool` | Publish a completed preview by generation ID |
| `listNewsStories` | Administrator-only active pool listing by category/country, with pagination |
| `retireNewsStory` | Administrator-only retirement; keeps existing assignments and history intact |
| `getNewsVocabulary` | Authorized preview/assignment reference; prepare/reuse first-occurrence vocabulary |
| `requestNewsMeaning` | Selected term, set and Scope language; remember preference and prepare/reuse a contextual meaning |
| `getNewsMeaning` | Poll an already requested meaning without changing the preference |
| `getNewsQuestions` | Prepare/reuse the authorized article's three questions; return keys only in submitted review |
| `submitNewsQuestions` | Atomically mark all three responses once and return the permanent score/answer review |
| `listStudentNewsHistory` | Paginated current student assignments, newest first, including prior articles and reviews |
| `getStudentNewsOverview` | Today's category slots and reset time; reports whether a timezone is needed |
| `requestStudentNews` | Category, language, initial IANA timezone and client request ID |
| `getStudentNewsAssignment` | The current student's assignment and a requested language |
| `requestStudentNewsLanguage` | Prepare/reuse a language edition of that same assigned story |
| `retryStudentNews` | Resume an assignment's failed or expired-lease preparation |
| `finishStudentNews` | Compatibility/recovery operation for an already submitted quiz; the student reader completes automatically on submission |

These student APIs are backend support for a future student reader; this change
adds the requested admin preview UI. Student identity, country and current grade
are derived server-side. Students cannot supply another student's ID or override
their grade/country. Admin saves and preview/pool operations verify the current
enabled, verified Firebase account and Site Admin membership.

Each student gets one successful international and one successful local article
per local calendar day. Requests serialize through
`studentNews/{uid}/daily/{date}_{category}`. Preparation reserves the selection;
failure does not mark it ready or completed. Reopening returns the same story.
Submitting all three answers automatically updates `studentNews/{uid}/history/{storyId}`, after
question submission. Completing the questions alone does not mark it read. Completion
persists across languages and grade changes. Selection prefers newer unread
active stories and scans older pool pages when necessary. It discovers a new
story only after the eligible unread pool is exhausted.

An initial IANA timezone is persisted in student news settings. Later request
parameters cannot change it to acquire extra articles. Calendar boundaries are
computed on the server and account for 23/25-hour daylight-saving days. Generation
that finishes after midnight can publish to the shared pool, but cannot consume
or replace an assignment in the new day. Existing completed/ready assignments
remain readable after their original day. There is no scheduled generation.

Shared story briefs live in `newsStories`, immutable completed editions in
`newsEditions`, and reusable media metadata under each story. Countries use the
existing Syllabus Scope/profile country names and a normalized pool-scope key.
A shared English title and factual-development identity identify new stories. DeepSeek
compares titles and facts against both the pool and saved private previews, including
retired stories. A material new development is allowed; a different headline, publisher
or URL alone is not. Source URLs remain citations. Existing story IDs and reading
history remain valid. See [title identity and duplicate detection](student-news-identity.md).
Editions are keyed for reuse by story revision, grade, selected language and
effective settings. Keys use canonical map ordering so Firestore serialization
does not cause duplicate generation. Latest-edition pointers are protected under
`newsEditions/_keys/items`; actual edition records remain immutable.

Language adaptation reuses the same story brief, page layout and existing image
set when a compatible grade edition is pooled. It invokes the text model only
for a missing language edition. A different grade can generate a different
format and image plan while sharing the same brief. Captions and alternative
text are localized independently of image files.
Private previews use a `basePreviewId` reference to the original completed
owner's preview for the same reuse, without requiring publication. The server
checks ownership before creating any translation job; a preview's cached
languages keep their original configuration after an administrator saves edits.

Paid work runs on the `onNewsGenerationRequested` Firestore worker. Each
`newsGenerations` record has a sequence, stage, ownership lease and checkpoints.
The worker performs one stage or AI image at a time and queues the next sequence,
keeping long picture stories within per-invocation deadlines. Shared edition
keys prevent matching concurrent requests from creating duplicate jobs. Discovery
is coordinated per category/country scope under
`newsGenerations/_scopes/items`. A stale lease is recoverable through a status
check/retry. Ownership is checked before requeuing an administrator's preview.

Source discovery uses DeepSeek v4 Pro's live `web_search` through
`utils/llm/llm_ops.searchLlmWeb` with `provider: "deepseek"`. The shared
adapter calls DeepSeek's Responses API at `https://api.deepseek.com` using
`DEEPSEEK_API_KEY`, with a bounded deadline and no implicit search retries.
The adapter rejects results without a completed search or sources absent from
the tool's returned citations and completed page-open/find actions. AP News
headline URLs and short URLs can refer to the same 32-character article ID;
these variants match only on AP's own hosts and resolve to a URL actually
returned by the tool. Other URLs require exact matches after removal of
tracking parameters. Clean links also match opened links carrying the known
`at_medium`/`at_campaign` analytics tags; matching returns the actual retrieved
URL, while preserving checks on paths and content-selecting query parameters.
Unknown hosts, article IDs and inferred paths remain
rejected. Discovery enables DeepSeek JSON mode and selects the final-answer
message ahead of progress commentary. Empty message containers can fall back
to the provider's aggregate text when no message text is available. Invalid or
incomplete JSON, or complete JSON with unusable citations, gets one bounded
DeepSeek repair pass using the same report and retrieved-link options. The
repair selects source URLs by fixed option IDs; the backend binds those IDs to
the actual retrieved URLs instead of trusting new URL strings. The brief must
include its title, canonical URL, dated
source metadata, at least two facts and valid source references. If the response
still lacks a usable verified brief, news discovery makes one compact recovery
search with the original criteria/exclusions and previous report as data.
Authentication, quota and transport errors do not initiate another paid search.
Search deadlines are 180s/120s and formatting deadlines 90s/45s, bounding the
worst case to 435s within the worker's 540s timeout. No more than two searches
and one formatting pass per search are permitted. Every candidate passes the
same URL grounding checks; no sources are invented to fill missing evidence.
An unverified source is removed together with facts supported only by it.
Remaining fact citations are remapped to the retained source order, duplicate
URLs share an identity, and the brief can proceed when at least one retrieved
source supports at least two retained facts. A missing/unverified canonical
link uses a retained source's URL/headline. If too little support remains, repair
or the bounded recovery search is still required.
Final failures record bounded counts/reasons in private `errorDiagnostics`
(attempt count, completed tools, URL/text counts and whether formatting ran),
without saving raw news reports or provider responses in logs.

Citation repair deployed on 2026-11-15, verified at 04:12 UTC. The latest
failed preview's diagnostics showed complete JSON, three retrieved links and
two failed attempts with no citation-repair pass. Complete-but-ungrounded
briefs now enter the same bounded repair path as malformed JSON, using fixed
retrieved-link IDs. Fifty-nine relevant unit checks passed, including safe
source/fact pruning, citation renumbering, duplicate URLs, invalid link IDs and
insufficient supported facts. A real DeepSeek repair of a controlled citation
mismatch in captured live evidence produced three retrieved sources and five
facts with one text call and no additional web search. The exact failed
Bahasa Melayu preview was resumed after deployment and completed privately:
400 words against target 400, two retained retrieved sources, six supported
facts and one image. It was not added to the pool.

A factual brief references validated source IDs,
and generated pages/images must reference its fact IDs. Article writing, grade
adaptation and language translations use DeepSeek v4 Pro through
`utils/llm/llm_ops.generateLlmText` with `provider: "deepseek"`. News opts into
up to 32,768 output tokens for long configured targets through a trusted server
option; other callers retain their existing 8,192-token ceiling unless they
explicitly opt in. Request bodies cannot raise that ceiling. Cached editions
continue to be reused; the provider change applies when new text is prepared.
Provider reference: https://api-docs.deepseek.com/guides/responses_api/.

Discovery recovery and tracking-link matching deployed to
`onNewsGenerationRequested` on 2026-11-14, verified at 18:20 UTC. Forty-five
relevant unit checks passed. A fresh live DeepSeek search produced a grounded
brief with three sources and six facts. A controlled insufficient first report
then exercised one real recovery search; its response exposed an opened UN URL
with `at_medium`/`at_campaign` tags versus the model's clean link. After fixing
that exact matching case, replaying the captured response produced a valid brief
with two sources and six facts, including through the bounded recovery path,
without additional provider requests. Different paths and content-selecting
query parameters remain rejected. No test article was published and no images
were generated. The original reported brief error could not be reproduced on
the fresh search; the new diagnostics preserve reasons/counts for future failures.

Article length is a generation target, not a readiness requirement. The prompt
explicitly states the configured total, a ±10% writing range and per-page
budgets. Only `pages[].text` is counted using the same Unicode segmentation as
`actualWordCount`; titles, alternative text, image descriptions, vocabulary and
questions are excluded. A draft outside the writing range receives one optional
DeepSeek rewrite at the checkpointed `word_count` stage before vocabulary,
images or questions are prepared. The worker then continues with whichever
valid draft is closer to the target, choosing the original on ties. A remaining
count difference never rejects a valid article. If the optional rewrite fails
or returns invalid/empty text, the first valid draft is retained. Unsupported
facts and malformed content cannot replace a valid original. An empty draft
is not a readable article, and picture-only editions keep story text empty.
Page layout, title, image plans/placement, alternative text and cached assets
are preserved. The admin preview displays both actual count and target.
Previously blocked jobs with a completed correction resume their saved valid
draft without another LLM rewrite. Existing completed editions remain immutable.

Non-blocking word targets deployed on 2026-11-15, verified at 03:32 UTC:
updated `onNewsGenerationRequested` and Hosting. Sixty-six unit checks, four
Firestore scenarios and the Chrome preview flow passed. The browser fixture
produces 334 words against a target of 400, receives a worse 320-word rewrite,
keeps the original and proceeds through vocabulary, questions and publication.
Eight published assets matched the workspace; the callable still required
sign-in. The exact blocked Bahasa Melayu Primary 6 preview reported by the user
was resumed after deployment and completed privately at 334 words with target
400. Its draft hash and completed rewrite count of one remained unchanged,
confirming no additional length rewrite was invoked. The article was not added
to the pool.

The word-budget and simplest-meanings update was deployed on 2026-11-14,
verified at 17:56 UTC: `onNewsGenerationRequested`, `studentNews` and Hosting.
Forty-eight unit checks, seven Firestore scenarios and the admin preview Chrome
flow passed. Thirteen published assets matched the workspace, the callable
required sign-in and the private question-key document rejected public access.
A live private length-correction check received 140 words for a 101–123 range;
the worker saved the draft as failed after exactly one automatic correction,
without preparing vocabulary or generating images. Per-page budgets and an
explicit expand/shorten amount were then added and unit-checked before the final
worker deployment. This verifies bounded correction and rejection of another
miss, not a guarantee that the provider always meets the target. An existing
private Bahasa Melayu article separately acquired a version-3 vocabulary set
with simpler inline definitions; its text and images were unchanged, and source
meaning reads required no provider call.

The worker binds the existing `DEEPSEEK_API_KEY` and `OPENAI_API_KEY` secrets.
OpenAI is used only for AI image generation. AI images use the existing
Image Generation settings, frozen with the requested edition. Freely reusable
web photos are searched through Wikimedia Commons, downloaded only from its
approved image hosts, size-limited and decoded/re-encoded before Cloud Storage
persistence. A web-photo acquisition gets one retry. If the complete set is still
unavailable, all images switch to AI; a published edition never mixes sources.
Cloud Storage contains bytes and download metadata; Firestore contains asset
references and provenance. Explicit retries reuse checkpointed work and stored
assets. A provider timeout without a response can still have incurred a charge.
Provider failures show stage-specific guidance for rejected requests,
authentication and quota errors. Protected job diagnostics retain only bounded
provider identifiers and status codes, without raw request or error payloads.
Image search terms normalize either one string or a short list of nonempty
strings into a single bounded query; malformed values remain rejected. This
handles valid model responses that group their search terms into a list.

Raw jobs, drafts, pool records, indexes, daily slots and history deny direct client
Firestore reads/writes, including administrators through the general fallback.
Authorized callables return only the article/status fields required by the UI.
Retirement removes a story from future selection without expiring other content
or deleting pinned editions. No admin manual text/image editor is provided.

Verification uses local `demo-*` projects with mocked paid providers:

```sh
node functions/features/news_article_generator/news_generation.test.js
node functions/deepseek.test.js
node public/features/student_news/news_config.test.mjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node functions/features/student_news/news_backend_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node functions/features/student_news/news_config_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node scripts/test-news-preview-browser.cjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node scripts/test-news-config-browser.cjs
```

The backend tests cover concurrency, private previews, owner checks, explicit
publication, all-AI fallback after exactly two web attempts, resumed images,
student pool reuse, grade/language changes, completion, timezone/reset behaviour
and retirement. Chrome checks cover interrupted start responses, retries,
publication failures, page navigation, selection preservation, unsaved settings,
and desktop/mobile layout. Real paid generation is not invoked by these tests.

Deployment order is rules/indexes, the worker, the callable, then Hosting:

```sh
bash scripts/deploy-firebase.sh firestore
bash scripts/deploy-firebase.sh function onNewsGenerationRequested
bash scripts/deploy-firebase.sh function studentNews
bash scripts/deploy-firebase.sh hosting
```

Deployed to `readyherox` on 2026-11-14 (verified at 07:42 UTC): Firestore
rules/indexes, `onNewsGenerationRequested`, `studentNews`, and Hosting. All nine
published news/admin assets matched the workspace, and the deployed callable
returned `UNAUTHENTICATED` without sign-in. Unit, emulator and Chrome checks
passed with mocked paid providers; no paid live generation was run.

Production fix verified on 2026-11-14 at 08:08 UTC: the provider returned HTTP 400
(`response_format`, “Web Search cannot be used with JSON mode”) for discovery.
Removed JSON mode from search requests while retaining JSON parsing and source
validation, and deployed the worker update. Eight unit tests and both backend
emulator tests passed. Resumed the latest failed private preview with real
providers: live search, a one-page Malay edition with two sources, and a
1024×1024 AI illustration completed successfully. The image download was
verified, and the preview remains private without publication to the pool.

Production follow-up verified on 2026-11-14 at 08:40 UTC: reproduced a grounding
failure where AP's search result used `/article/<id>` and the model returned
`/article/<headline>-<id>` for the same article. Added bounded publisher-specific
identity matching that retains a retrieved URL, and included completed
page-open/find actions in the evidence collection. Replaying the captured live
response now passes, while tests reject different IDs, unrelated hosts and
failed tool calls. Live verification then exposed a model-provided list of
image search terms; query normalization and an explicit prompt fix handle that
valid representation. Both captured responses pass validation and all 12 unit
tests pass. Deployed the worker fixes and resumed the same private preview at
its saved stage: the Chinese article and its 1024×1024 image completed, and the
image download was verified. It was not added to the pool.

Preview language switching deployed and verified on 2026-11-14 at 08:59 UTC:
updated `onNewsGenerationRequested`, `studentNews` and Hosting. All 23 unit
tests, three backend emulator scenarios and both Chrome flows passed. Browser
coverage includes switching an unpublished picture story, retained page
position, cached return switches and retry after a lost language response.
A real English edition of the completed private Chinese preview also finished;
its image metadata, settings and image placement exactly match the original,
and repeating the request returned the completed cached job. Both versions
remain private. Nine published assets matched the workspace, and the deployed
callable still rejected unauthenticated access.

DeepSeek text routing deployed and verified on 2026-11-14 at 09:35 UTC: the
worker now binds `DEEPSEEK_API_KEY`, and all article writing, grade adaptation
and language translation calls use `utils/llm`'s DeepSeek adapter (v4 Pro).
Thirteen news unit checks and ten DeepSeek checks passed, including shared
adapter routing, both secret bindings, long-output limits and unchanged HTTP
body token limits. A new private Bahasa Melayu edition of the existing Chinese
preview completed through the deployed worker, retaining the exact original
image, settings and page layout; its image download was verified. Discovery
continues to use OpenAI web search, and AI images use the configured image
provider. No cached editions were regenerated or added to the pool.

DeepSeek discovery deployed and verified on 2026-11-14 at 09:49 UTC. This
supersedes the earlier OpenAI discovery implementation: discovery, factual
briefs, article writing, grade adaptation and translations now all use
DeepSeek through `utils/llm`; OpenAI is used only for AI image generation.
The shared web adapter calls DeepSeek's Responses API with native live search,
a bounded deadline and no fallback to OpenAI. It preserves search evidence,
and news parsing uses the final assistant message, including fenced JSON when
present, rather than search-progress messages. The shared JSON parser also
continues to serve ordinary DeepSeek text generation.

All 36 news, DeepSeek and image unit checks passed. A direct live search used
only `api.deepseek.com/responses`, and its captured factual brief passed source
validation. A new private preview then completed on the deployed worker:
DeepSeek discovery and writing, four validated source links, and a 1024×1024
OpenAI illustration. The image download and private status were verified; the
preview was not added to the pool.

Intermittent discovery-formatting failures fixed and deployed on 2026-11-14,
verified at 11:18 UTC. Discovery now requests native DeepSeek JSON mode,
prioritizes explicit final-answer messages over later commentary, and applies
one bounded formatting-repair pass to malformed output using the existing
search report and URL evidence. Repair uses DeepSeek through `utils/llm`,
does not repeat web search, and cannot bypass source validation. Sixteen news
and twelve DeepSeek unit checks passed, including refusal of invented repair
sources and insufficient evidence. Live JSON-mode discovery and live repair
of an existing report both passed validation. The latest affected private
preview was resumed successfully: three pages, five sources and three
1024×1024 illustrations. All three downloads and its private status were
verified. It was not added to the pool.

The student dashboard and reader, automatic question-submission completion, and
Reward Admin news coins are implemented in [student dashboard and reader](student-news-student-dashboard.md).
