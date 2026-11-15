Student news dashboard, reader and rewards
=========================================

The student learning dashboard now has a Today's News section immediately after
Student Summary. It shows one international slot and one local slot based on
the authenticated student's profile country. Cards show Read, Preparing,
Continue reading or Completed, with frozen reward amounts or earned coins.
Loading or refreshing the dashboard only reads status; it never starts paid
generation. The saved student timezone controls the daily midnight reset.

Read opens `/features/student_news/pages/reader/news_reader.html`. Each new
daily article starts with an explicit language choice from Syllabus Scope.
Selecting a language requests the existing daily assignment, reuses the pool,
or starts discovery/edition preparation on demand. The reader preserves the
request ID after a lost response, polls preparation, and offers resumable retry.
Reopening a daily slot always returns its assigned story. Languages share the
same story and do not create another daily allocation.

The reader supports all configured grade formats, page navigation, images with
credits, source links, first-occurrence vocabulary meanings and both question
answer modes. It reuses the same vocabulary and question components as the
admin preview. After submitting all three questions, the score and answer
review appear and the article is automatically completed; no finish button or
second attempt is shown. A lost submission response is checked using the same
saved answers. Changing language preserves the submitted attempt and rewards.

Reading history lists the current student's daily assignments using a bounded,
cursor-based API ordered by creation time and document ID. Earlier assigned
stories remain accessible, including newly requested language editions, without
using today's slots. Discovery without an assigned story still respects its
original daily window. History and assignment APIs derive the student ID from
authentication and never accept a target student's ID from the browser.

Rewards are owned by the Reward feature. Reward Admin adds two global settings
in the existing `rewards/config` document:

| Setting | Default | Meaning |
| --- | --- | --- |
| `newsArticleCompletionCoins` | 2 | Award for submitting all three answers at any score |
| `newsAllCorrectCoins` | 2 | Additional award for a score of 3/3 |

Amounts are nonnegative safe integers; zero disables that reward. Legacy reward
configuration reads use the new defaults without persisting them. Each daily
assignment saves `rewardSettings: {completionCoins, allCorrectCoins}` before
preparation, so later admin changes cannot change its promised amounts. Legacy
assignments freeze amounts on first reopening, or on submission if necessary.

Student submission commits the immutable quiz answers, assignment completion,
reading history, both reward entries, category totals and overall balance in
one Firestore transaction. Coin histories use the existing paths:

```
rewards/{studentId}/categories/newsArticleCompletion/history/news_{storyHash}
rewards/{studentId}/categories/newsAllCorrect/history/news_{storyHash}
```

The first story reward records its amount and score, including a zero marker for
disabled completion rewards. Each student/story/reward is credited once across
languages, repeated requests and concurrent submissions. Overflow, malformed
balances or write failures roll back submission and completion together. Admin
preview question submissions never create rewards. The compatibility
`finishStudentNews` API can reconcile a previously submitted quiz safely.

Existing My Coins totals and recent activity include the two news categories.
Firestore rules preserve student reads of their balances and histories while
restricting reward writes to trusted backend code or site administrators. This
also closes the previous generic owner-write rule for reward balances and
entries; browser Reward write APIs already required a site administrator.

Backend API changes
-------------------

- `getStudentNewsOverview`: adds country, Syllabus Scope languages, reward
  settings, slot title, selected language, score and earned rewards. It does not
  retry workers or allocate articles.
- `listStudentNewsHistory({limit?, cursor?})`: returns only the authenticated
  student's assignment summaries, with an opaque document cursor; limit 1–50.
- `getStudentNewsAssignment` and language requests: return frozen reward
  settings and earned rewards, and retain access to earlier assigned stories.
- `submitNewsQuestions`: includes `completion: {assignmentId, completedAt,
  rewards: {completionCoins, allCorrectCoins, totalCoins}}` for students only.

Validation
----------

```sh
node --test public/features/reward/*.test.mjs public/features/student/pages/landing/landing_login.test.mjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node --test functions/features/student_news/*emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node scripts/test-news-student-browser.cjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node scripts/test-news-preview-browser.cjs
```

The Chrome student flow covers both formats of questions, explicit language
selection, private reading history, translations, images and pagination,
vocabulary, interrupted article/submission responses, earned coins, mobile
layout and Reward Admin persistence. Firestore scenarios cover frozen rewards,
zero amounts, failed transaction rollback, concurrent submissions, privacy,
history pagination and later-day language editions. Tests inject providers and
run locally; they do not invoke production LLMs or publish test articles.

On 2026-11-15, 315 unit checks, 23 Firestore scenarios, the student Chrome
flow and the existing admin preview Chrome flow passed. A separate rules check
verified owner reads, blocked student reward writes and permitted administrator
configuration writes. The final history check also verified expired-search labels.

Deploy Firestore rules, then the `studentNews` callable, then Hosting. The news
generation worker and existing reward triggers keep their current interfaces.

Released to `readyherox` on 2026-11-15 in this order: Firestore rules,
`studentNews`, then Hosting. No production test articles, quiz attempts or coin
awards were created during validation.

Reader fetch recovery (2026-11-15)
---------------------------------

The latest reported Chinese Primary 4 article finished at 07:31:55 UTC with
four pages and three images, while its student assignment still awaited the
reader's final ready response. Production request metrics showed successful
responses, no service errors or timeouts, and memory below the configured limit.
Cloud Logging access was unavailable to the deployment account, so the check
used Firestore state, Cloud Monitoring and read-only local response replay.
The saved article passed both backend callable encoding and the actual Firebase
12.15.0 browser SDK decoder.

The SDK converts a failed browser fetch into the bare `functions/internal`
message shown in the report. The reader now retries transient request errors
at most three times with increasing delays, preserving the original request ID
and assignment. After an uncertain generator-retry response, automatic attempts
only check the assignment; they do not restart the generator. Persistent errors
show a clear retry instruction instead of a raw SDK code. Specific validation
and access errors remain visible and are not automatically retried.

Two transport unit tests and the full student Chrome flow passed, including
bounded repeated failures and automatic recovery from `functions/internal` on
a completed article fetch. A separate Chrome replay used the exact saved
Chinese response with the real Firebase 12.15.0 SDK: its first fetch was forced
to fail and its second returned all four pages, with zero new-article requests,
zero generator restarts and zero production writes. No model call was needed.

Article preparation progress (2026-11-15)
----------------------------------------

The student reader and admin preview share an accessible article progress bar.
It starts only after an article/language is requested, displays the current
backend stage and the number of images ready, and reaches 100% when the article
response is ready to read. Quiz preparation and submission are separate from
article preparation and do not delay the bar reaching 100%.

Percentages are explicitly estimated from stage boundaries and image counts;
there is no timer-based simulated progress or ETA. The estimate retains its
position through duplicate-search retries, discovery/edition job handoffs,
image fallback and connection errors. The stage label and image counts always
reflect the latest response. Failed preparation or lost monitoring pauses the
indicator with recovery instructions. A newly requested language starts a fresh
bar while keeping the previous article readable; cached versions finish at once.
The bar resets and hides when the reader's account/session stops.

The native progress element has an accessible name and estimated-value text.
Stage changes are announced politely, and reduced-motion settings disable the
activity animation. The shared component is `components/news_progress.js`, with
`pages/common/news_progress.css`; the existing backend progress API is reused.

`node scripts/test-news-progress-browser.cjs` checks stage changes, job handoff,
image counts/fallback, retries, readiness, cached language switching, accessibility,
reduced motion, mobile width and cleanup. The full student and admin preview
Chrome flows also passed with the bar enabled, including paused start responses
and admin preview completion before quiz submission.

The progress bar was released to Hosting on 2026-11-15 after all three Chrome
flows passed. No backend deployment or production article generation was needed.

Meaning and language progress (2026-11-15)
-----------------------------------------

The reader and admin preview now show a dedicated language progress bar beside
the article language selector. It names the requested language, follows the
existing preparation stages, and keeps the currently displayed article readable.
It replaces the completed generation bar during a switch, pauses on connection
errors, preserves its estimate during retries, and finishes at 100% when the
new version is displayed. Cached versions finish immediately.

The meaning panel still displays the prepared article-language definition on
the first click without a request. Selecting another language starts a separate
progress bar inside the panel. It reports checking the cache, queued/running
preparation, readiness or a paused connection. Queued and running percentages
are stage estimates, explicitly labelled as estimated, with no simulated timer
or claim to measure model token completion. Cached meanings reach 100% at once.

Changing a meaning language starts a new estimate while preserving all language
choices. Clearing the selection, closing the panel (including Escape), changing
articles or ending the session resets the indicator. Existing request guards
prevent a late response from updating another lookup's progress. Both operations
reuse the existing APIs and shared accessible, reduced-motion progress component.
