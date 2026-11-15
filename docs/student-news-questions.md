# Student news comprehension questions

Every article has three single-blank comprehension questions, with one final
submission. Grade configuration selects `questionAnswerMode: "typed" |
"word_bank"`. Defaults are word bank for Primary 1–4 and typed answers for
Primary 5–6 and Secondary. Missing legacy fields inherit these defaults; no
configuration migration is necessary. Answer mode is frozen when a daily
assignment or preview is created, with a legacy fallback when first opened.
It does not change article text/image reuse keys.

The word bank contains three distinct correct answers and two distractors.
Choice IDs are opaque random IDs and their order is shuffled once, so IDs and
ordering do not disclose which choices are correct. All questions must be
answered before submission. Typed answers accept only stored alternatives,
ignoring case, Unicode compatibility differences and repeated whitespace.
There is no LLM marking, score threshold or second attempt. Student submission
automatically finishes the article and credits its configured rewards in the
same transaction. The separate finish API remains for recovery. Admin preview
submissions remain private demonstrations and never award coins.

Questions are prepared on demand by `getNewsQuestions` once the article is
ready. This also adds questions to existing editions without rewriting their
text or images. All generation and translation use DeepSeek through
`utils/llm`. Shared, fenced generation jobs are retryable if preparation fails;
this is separate from the single student submission.

New editions have a `questionFamilyId` inherited from the base edition when
translating/adapting its text; independently generated article bodies have
independent families. Old editions use their existing language-independent
`baseKey` as the fallback. The first question request fixes the canonical
three questions for that family. Languages retain the same question IDs,
answer-choice links and choice order. Translation must cite evidence from the
target edition. The backend checks exactly three questions, exactly one `____`
per prompt, five distinct unambiguous choices and exact evidence in page text
or the article's image descriptions/alt text. For picture-only stories the
prompt permits only clearly pictured details.

Storage is server-only:

- `newsQuestionSets/{hash(version, questionFamilyId)}`: immutable canonical
  questions, private answer keys, accepted answers, evidence and five choices.
- `newsQuestionSets/{setId}/languages/{hash(normalizedLanguage)}`: translated
  prompts, choices and accepted answers, retaining stable identities.
- `newsGenerations/questions_{setId}` and
  `newsGenerations/question_language_{hash(setId,languageId)}`: shared resumable
  generation jobs containing only the needed article text/image descriptions.
- `studentNews/{uid}/questionAttempts/{hash(storyId,gradeKey)}`: fixed set/mode,
  then the first submission's responses, language, score and timestamp.
- `newsGenerations/{originalPreviewId}/questionAttempts/{ownerUid}`: separate
  private admin demo result, shared across that preview's language versions.

The authenticated `studentNews` callable exposes:

```js
getNewsQuestions({ ...articleReference, retry: true /* optional */ })
submitNewsQuestions({
  ...articleReference,
  setId,
  answers: [{ questionId: "q1", value: "..." }, /* q2, q3 */]
})
```

An article reference is exactly one of `{previewGenerationId}` or
`{assignmentId, articleLanguage}`. Preview access requires the owning current
administrator; student access resolves only that student's assigned edition.
The question set cannot be supplied to the read endpoint. Submission requires
the set already bound to that student's article attempt and an available
language edition. `value` is typed text or a choice ID according to the frozen
mode. Scores and correctness are computed server-side in a transaction. A
duplicate submission returns the original result, including across languages.

Before submission the read response contains prompts and, only for word-bank
mode, the five choices. Keys, evidence and accepted answers are redacted.
After submission it also contains the saved score, submitted responses and
correct answers. Switching languages translates the review while retaining
the original score and typed responses; bank responses use translated choice
labels. The read response's opaque `attemptId` scopes local draft input.

The admin preview mounts the reusable `pages/common/news_questions.js`
component below the article/page controls. It supports typed input, selecting
a blank and then a shared-bank choice, and permanent review after submission.
On an uncertain submission response it retains the exact request and offers
Check submission, preventing accidental changes or another attempt. Typed
drafts are retained per attempt/language; bank selections retain stable IDs
across language changes. Admin demo submissions never affect student attempts
or publish the private article.

Verification:

```sh
node functions/features/news_article_generator/news_questions.test.js
node public/features/student_news/news_config.test.mjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node functions/features/student_news/news_questions_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node functions/features/student_news/news_backend_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node functions/features/student_news/news_config_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node scripts/test-news-preview-browser.cjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node scripts/test-news-config-browser.cjs
```

Deploy Firestore rules before the worker/callable and Hosting so the new
answer-key collection is protected before it receives data.

Deployed to `readyherox` on 2026-11-14 and verified at 16:16 UTC: Firestore
rules, `onNewsGenerationRequested`, `studentNews` and Hosting. Forty unit
checks, ten Firestore emulator scenarios and both Chrome flows passed. The
preview tests cover typed and shared-bank input, translated review, mobile
layout and recovery of a lost submission response without another attempt.
Thirteen published assets matched the workspace. The deployed callable
requires sign-in and the live question-key document rejects unauthenticated
reads. DeepSeek prepared three grounded Bahasa Melayu questions and five
choices for an existing private preview; its article text/images remained
unchanged. There was no existing English edition for that preview, so no new
article/image generation was performed for the live check; cross-language
identity and immutable scores were verified with the emulator and browser.
