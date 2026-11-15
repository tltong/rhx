News schema and feature proposal
===============================

Proposal against RHX commit `2c292eb`. This document describes the feature; it
does not implement it or change production configuration.

The configuration portion is now implemented inside `student_news`; see
`docs/student-news-configuration.md` for its defaults, API, verification, and
deployment notes. The pool, generation worker, student APIs and admin preview are implemented as described in `docs/student-news-backend.md`; the student reader UI is a later step.

Use one shared story with independently generated grade/language editions.
Student assignments and reading history reference the story and its editions.
This follows the existing separation between essay configuration, reusable
content, generation, and student assignment features.

The suggested Firestore documents are:

| Path | Purpose |
| --- | --- |
| `newsConfig/settings` | Shared prompts and length defaults |
| `newsConfig/type_{articleTypeId}` | Photo count and photo type for each built-in format |
| `newsConfig/grade_{level}_{standard}` | One format, grade prompt, and length overrides per grade |
| `newsStories/{storyId}` | Shared facts, sources, category, and country |
| `newsStories/{storyId}/media/{assetId}` | Reusable web photos and generated illustrations |
| `newsEditions/{editionId}` | A complete, immutable grade/language edition |
| `newsGenerations/{jobKey}` | Shared, resumable story-discovery or edition-generation work |
| `studentNews/{studentId}` | Student news timezone and current quota-window coordination |
| `studentNews/{studentId}/daily/{localDate}_{newsType}` | One daily assignment per category |
| `studentNews/{studentId}/history/{storyId}` | Completion history independent of grade and language |

All news-specific configuration lives directly in the single `newsConfig`
collection. Documents use `kind: settings|articleType|grade` and deterministic
IDs to distinguish their roles. Each has `version`, `updatedAt`, and `updatedBy`.
The settings document's `version` is the aggregate configuration revision and
increments whenever any configuration document changes. Configuration saves use
`expectedVersion` and atomically update that revision with the affected documents,
matching Essay Configuration's stale-save protection. Schema declarations should
be mirrored in `functions/schema/` and `public/config/firebase/` using RHX's
existing descriptive schema convention.

**Shared configuration** would contain these fields:

```js
// newsConfig/settings — suggested initial defaults
{
  kind: "settings",
  schemaVersion: 1,
  version: 1,
  discoveryInstructions: "...",       // web discovery and student suitability
  additionalLlmInstructions: "...",   // common edition-writing instructions
  defaultTargetWordCounts: {
    standardArticle: 400,
    multiPageArticle: 400,
    pictureStory: 50
  },
  defaultMultiPageCount: 4,            // proposed page-count default
  updatedAt: "timestamp",
  updatedBy: "administrator UID"
}
```

The supported formats are the three built-in IDs `standardArticle`,
`multiPageArticle`, and `pictureStory`. No separate source-outlet list or topic
filter configuration is needed. Discovery uses a web-enabled provider, with
country/category supplied by the server. Text generation and AI images can use
the existing shared LLM and Image Generation configuration.

Available languages are derived from the existing Syllabus Scope language API,
which combines, deduplicates and sorts languages across scopes. Configuration
responses include a read-only `supportedLanguages` list; it is not a separate
news setting or copied into `newsConfig`. Admins manage languages in Syllabus
Scope and can refresh the list without discarding other news configuration edits.

**Article-type configuration** has exactly two editable image settings:

```js
// newsConfig/type_pictureStory — illustrative image settings
{
  kind: "articleType",
  articleTypeId: "pictureStory",
  photoCount: 5,
  photoType: "ai", // "web" | "ai"
  version: 1,
  updatedAt: "timestamp",
  updatedBy: "administrator UID"
}
```

`photoCount` is a nonnegative integer; picture stories require at least one.
Zero disables images for the other formats. Grades sharing a format share its
image settings. `web` means web photos first, one retry, then an entirely AI
image set if the required count cannot be met. A completed edition never mixes
web and AI images. `ai` goes directly to AI image generation.

**Grade configuration** uses RHX's existing `primary_1` / `secondary_1` grade
identity rather than an ambiguous numeric grade alone:

```js
// newsConfig/grade_primary_1 — illustrative grade choice
{
  kind: "grade",
  level: "primary",
  standard: 1,
  articleTypeId: "pictureStory",
  additionalLlmInstructions: "...", // vocabulary, style, and difficulty
  targetWordCount: null,            // null inherits the format's shared default
  pageCount: null,                  // override for multiPageArticle only
  version: 1,
  updatedAt: "timestamp",
  updatedBy: "administrator UID"
}
```

The word target is the total story text across the entire edition, excluding
source credits and interface labels. An explicit zero is valid for picture
stories and must not be mistaken for a missing override. Standard articles have
one page; text articles with multiple pages use the grade override or shared
default. Picture-story page count always equals `photoCount`; a separate page
override is not accepted. Numeric settings take precedence over conflicting
free-text prompt instructions. The selected language is supplied at runtime.

**The shared story** has the following suggested fields:

| Field | Meaning |
| --- | --- |
| `newsType` | `international` or `local` |
| `country` | Syllabus Scope country name for local news; `null` for international |
| `canonicalStoryKey` | Stable identity used to group reports of the same story |
| `sourceTitle`, `sourceLanguage` | Discovery metadata |
| `publishedAt`, `discoveredAt` | Original publication and retrieval dates |
| `facts` | Bounded factual brief, with fact IDs and supporting source IDs |
| `sources` | Source IDs, URLs, publishers, titles, publication dates, and retrieval dates |
| `revision` | Version of the shared factual brief |
| `status` | `active` or `retired` |
| `createdAt`, `retiredAt`, `retiredBy` | Lifecycle metadata |

Use normalized source URLs and an event identity to deduplicate discovery;
different grade editions do not create different story identities. Original
source dates and credits remain visible. Source evidence and large retrieval
payloads stay backend-only; edition readers receive the relevant citations.
Stories have no expiry field. Removal retires a story from future selection,
preserving references from existing assignments and history.

**A media asset** records `sourceType: web|ai`, `storagePath`, MIME type,
dimensions, and timestamps. Web assets also retain source URL, creator/credit,
and reuse-licence metadata. AI assets retain generation settings and an input
fingerprint, with an illustration label. Image bytes belong in Cloud Storage,
not base64 inside Firestore. Captions and localized alternative text belong to
editions so suitable image files can be reused across languages and grades.

**An edition** contains `storyId`, `storyRevision`, `gradeKey`, `level`,
`standard`, `language`, `articleTypeId`, and an `effectiveSettingsHash`.
It also contains:

```js
{
  configurationSnapshot: { /* resolved prompts, word/page/image settings */ },
  title: "...",
  pages: [
    { position: 1, text: "...", images: [{ assetId: "...", altText: "..." }] }
  ],
  targetWordCount: 50,
  actualWordCount: 48,
  requestedPhotoType: "web",
  actualPhotoType: "ai", // null when photoCount is zero
  photoFallbackUsed: true,
  status: "ready",
  createdAt: "timestamp"
}
```

The example word/image values are illustrative. Standard articles use a
single `pages` entry, giving the reader one consistent rendering structure.
Picture stories have one image per page. The configured number of images must
be present, and all images must have the same actual source type. Publish an
edition only when all text and images are ready. Intermediate drafts belong
to protected generation state. Ready editions are immutable: regeneration
creates a new edition ID and retains previously assigned editions.

Compute the settings hash from the effective grade settings, selected format's
image settings, relevant default values, and generation instructions. An edit
to another grade should not invalidate unrelated editions. Configuration
changes trigger adaptation only on demand; they do not require new story
discovery or automatic bulk regeneration.

**Student daily assignments** store `newsType`, `localDate`, `timeZone`,
`windowStartAt`, `windowEndAt`, `countryCode`, `gradeKey`, `storyId`, the frozen
effective configuration, and `editionIdsByLanguage`. Lifecycle fields include
`status: preparing|ready|completed|failed`, generation references, `assignedAt`,
`openedAt`, and `completedAt`.

Use separate documents for international and local news. A pending preparation
serializes repeated requests but does not consume the allowance on failure.
Publishing/opening the complete assignment uses that day's allowance. Completion
is independent: an opened but unfinished article still occupies the daily slot.
Requests that day return the same story, including after completion. A language
switch requests a missing edition of the assigned story using its frozen
configuration; it never changes the story or creates another daily allowance.

History is keyed by `storyId`, with `firstAssignedAt`, `lastAssignedAt`,
`completedAt`, and the completing assignment reference. Only the Finished
Reading action sets completion, atomically updating assignment and history.
Grade, language, and regenerated-edition changes do not erase story completion.

RHX currently has country and grade information but no timezone in its student
schema. Persist an IANA `timeZone` in the student's news settings. Compute dates
and midnight boundaries on the server. Persist the active window so timezone
changes and cross-device requests cannot create extra allowances. Both categories
share that window. Recheck the window before assignment publication if generation
crosses midnight; the completed edition can still enter the shared pool.

**Generation jobs** have a work kind (`discoverStory` or `prepareEdition`),
status (`queued|running|completed|failed`), frozen inputs/configuration,
`leaseToken`, `leaseUntil`, stage/checkpoint data, attempt counters, error fields,
timestamps, and a result story or edition reference. Use a shared job key for
matching edition work: story revision + grade + language + effective settings.
Serialize discovery by pool scope and recheck for a suitable story after taking
the lease. A student request can await discovery and then edition preparation.

Persist the factual brief, text draft, and completed image work so a resumed job
does not deliberately repeat successful paid work. Leases and idempotency keys
reduce duplicate work; a provider timeout without a response is not a guarantee
that the provider did no billable work. Required-image failure leaves the article
unavailable and the daily allowance unconsumed. No daily generation schedule is
needed.

The feature boundaries would be:

| Feature | Responsibility |
| --- | --- |
| `news_article` | Shared stories, editions, media, pool lookup, admin preview and retirement |
| `news_article_generator` | Web discovery, factual briefs, LLM adaptation, web-image retry/AI fallback, durable workers |
| `student_news` | Configuration defaults/validation/versioned saves, effective settings and prompt composition, student scope, local daily windows, assignment, language switching, completion history |

Configuration belongs inside `student_news`; there is no separate configuration
feature. Storage remains the single `newsConfig` collection described above.
The suggested organization is:

```text
functions/features/student_news/
  student_news_module.js
  domain/news_config.js
  application/get_news_configuration.js
  application/save_news_configuration.js
  application/request_student_news.js
  application/finish_student_news.js
  infrastructure/firestore_news_config_repository.js
  infrastructure/firestore_student_news_repository.js

public/features/student_news/
  student_news_module.js
  pages/admin/                 # news configuration controls
  pages/reader/                # student article reader
```

The `student_news` module exposes `getNewsConfiguration()` and
`saveNewsConfiguration()` alongside its student-facing operations. Saving remains
restricted to site administrators. Student generation resolves configuration
server-side and passes immutable effective settings into the article generator;
the generator does not import the student-facing orchestration module to read
configuration. Admin regeneration uses the same trusted settings resolver.

Give each feature its own `domain/`, `application/`, `infrastructure/`, and
`*_module.js` entry point where appropriate, following current RHX patterns.
Frontend modules call authenticated backend actions; students cannot directly
write the pool, generation jobs, quotas, or completion history. The backend
derives country and current academic scope from the student profile. Admin
authorization follows the existing verified Site Admin checks. Configuration
and pool management do not expose manual text/image editing.

Suggested public operations are:

| Operation | Result |
| --- | --- |
| `getNewsConfiguration()` | Defaults, types, grades, configuration revision, and derived Syllabus Scope languages |
| `saveNewsConfiguration({configuration, expectedVersion})` | Validated atomic admin save |
| `getStudentNewsOverview()` | Today's two slots, preparation/completion state, and next reset |
| `requestStudentNews({newsType, language, clientRequestId})` | Existing daily assignment or a preparation reference |
| `getStudentNewsAssignment({assignmentId, language})` | Authorized complete edition or preparation state |
| `requestStudentNewsLanguage({assignmentId, language, clientRequestId})` | Reused or newly prepared language edition of the assigned story |
| `finishStudentNews({assignmentId})` | Idempotent completion of the assigned story |
| `retryStudentNews({assignmentId, clientRequestId})` | Resume failed preparation without an extra daily slot |
| Admin pool list/preview/regenerate/retire actions | Inspect and manage reusable content |

Admin previews and explicit regeneration are user-triggered operations. A preview
should be isolated from student quotas and normal pool publication. Regeneration
can publish a new complete edition while preserving pinned assignments.

The student flow is: return today's assignment if one exists; otherwise select an
active story matching category/country that the student has not completed; reuse a
compatible edition or generate the missing one; discover a new story only when
no suitable unread story exists; wait for all images; publish the daily assignment.
Opening does not mark the story read. Finished Reading does.

For the Grade 6 / Grade 1 example, the story and source brief stay the same.
Grade 6's standard edition remains pooled. Grade 1 gets a new picture edition
and the images required by its format. Subsequent matching Grade 1 requests reuse
that edition. No fresh news search is needed for that adaptation.

Relevant existing references are `docs/essay-configuration.md`,
`functions/schema/essay_config_schema.js`,
`functions/schema/subject_assessment_generation_schema.js`, and
`functions/features/image_generation/README.md`. Existing text generation uses
the shared LLM utility. News discovery now uses its DeepSeek web-search adapter;
article writing and translations also use DeepSeek, with OpenAI used only for
AI image generation. See `docs/student-news-backend.md` for the implementation.

Implementation checks should cover daily-slot races, shared edition generation,
midnight/timezone handling, completion across languages/grades, exact image counts,
the two-attempt web-photo policy and complete AI fallback, missing editions,
configuration changes, retirement, and generation failures. These checks can mock
paid providers and use the Firestore emulator for atomic assignment behaviour.
