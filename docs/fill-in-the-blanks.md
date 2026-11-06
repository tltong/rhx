# Fill-in-the-blanks practice

Implementation order: schemas, seven features, shared integrations, end-to-end validation.

## Contracts

- A passage is one practice; each blank is one equally weighted question.
- Grade configuration determines the exact blank count. Frameworks determine difficulty,
  qualifying score and number of completed passages, not blank count.
- Students type answers; nonempty answers must meet the displayed word count. Empty
  answers receive zero. Ignore case and extra whitespace, but require correct spelling.
- Required word counts are calculated from model-answer text with the same counting
  rule used for student answers. Incorrect LLM-supplied counts do not discard a
  valid question. Punctuation-only answers and answers above 30 words are rejected.
- Static model-answer checks precede one batch LLM request for remaining answers.
  Completion, final score and rewards follow successful marking of the whole passage.
- Pre-assessment is one passage. Its difficulty is configured in the assessment framework,
  defaults to Medium, and uses the same seven score-band-to-level mappings as MCQ.
  Blank count and optional image still come from the grade settings.
- Administrators generate and attach pre-assessment to a topic/language. Syllabus
  subscription assigns that passage to unseen students; it is the first mission for
  that topic. The final marked percentage determines the student's starting level.
- Pre-assessment practice definitions retain an immutable framework snapshot. Later
  configuration edits affect newly generated definitions, not already assigned work.
  Placement applies once; it does not count toward later regular-practice promotion.
- Student practice records own assignments/completions. Daily missions reference them.
- Reuse a random suitable passage never assigned to that student. Generation returns
  a short summary; previous summaries from the same school level/grade/difficulty
  guide new scenarios, without a seed generator or post-generation duplicate checks.
- Pictures support a fully answerable written passage. Derive their prompt from the
  passage, retain coherent settings/actions, and fall back to text on picture failure.
- Save content once for reuse; assigned content is immutable. Administrators manage
  generation drafts and protected model answers. Students cannot read answer keys.
- Generation status remains independently observable for automatic dashboard refresh.
- Existing readiness/reliability/reward policies apply. One passage counts as one
  completed practice; an award's existing deduplication identity is preserved.
- The admin Try section is preview-only: generated text and images remain in browser
  memory, with no draft, question-pool, image-asset or Storage writes. Optional pictures
  use the existing generic image service; changing/closing the preview releases them.
  Generating and attaching a pre-assessment is handled by the Practice Generator
  admin page; the Question Generator admin page contains only configuration and preview.
- No tutor or OCR support in this version.

## Feature ownership

1. `fill_in_the_blanks_question_generator`: configuration, prompts, shared pool and admin preview.
2. `fill_in_the_blanks_practice`: reusable definitions containing blank references.
3. `fill_in_the_blanks_practice_generator`: initial topic/language setup.
4. `fill_in_the_blanks_scoring`: static/LLM marking and final results.
5. `student_fill_in_the_blanks_practice`: assignments, submissions, usage and completions.
6. `student_fill_in_the_blanks_practice_generator`: follow-up selection, durable generation jobs.
7. `fill_in_the_blanks_practice_session`: student loading/submission and web page.

Web feature APIs use Firestore repositories, following MCQ/essay. Admin generation
reuses the existing `generateDeepseekText` and `generateLlmImage` services. There is
no dedicated fill-in-the-blanks HTTP endpoint. Students create immutable submissions;
a Firestore trigger performs all marking before saving a final result and completion.
The existing completion flow then handles progression, rewards and the next practice.
Firestore listeners expose only authorised student state, including queued marking.
Retries update only a submission request ID/timestamp, retaining original answers.

## Entry points and deployment

- Admin: `/features/fill_in_the_blanks_question_generator/pages/admin/fill_in_the_blanks_admin.html`.
- Student/result: `/features/fill_in_the_blanks_practice_session/pages/practice/fill_in_the_blanks_practice.html?practiceId=...`.
  Guardian reports also include `studentId` and use read-only access.
- Trigger: `onStudentFillInTheBlanksPracticeSubmitted` (marking and explicit retry requests).
- Trigger: `onStudentFillInTheBlanksPracticeCompleted` (retryable follow-up; no warm instances).
- Existing `onSyllabusSubscriptionCreated` also provisions the pre-assessment assignment.
- Existing `generateLlmImage` gains the administrator-only `createFillInTheBlanksPicture`
  action for image generation/storage, matching the existing essay picture approach.
- Deploy Functions, Firestore rules/indexes and Hosting together. Publish the new rules/indexes
  before enabling the new type; wait for the history composite index to finish building.
- Existing MCQ and essay framework types keep their contracts. A topic/language retains
  its existing single framework mapping. New fill-in-the-blanks pre-assessments use
  their configured score-to-level mapping. Legacy starting practices without placement
  settings retain their first-level behaviour; established student levels are preserved.
- Initial jobs are at `studentFillInTheBlanksPracticeGenerations/{studentId}/initials/{attachmentHash}`;
  follow-ups remain at `.../completions/{completedPracticeId}`. Assignment creation precedes
  the observable completed state; framework completion records an explicit terminal outcome.
- Topic reset removes the new student's practice/progress state but retains passage usage,
  reusable content and earned coins. Stale workers cannot recreate removed assignments.

## Validation

Use Node 22. Provider calls in these checks are mocked; no paid generation is needed.

```sh
node functions/fill_in_the_blanks.test.js
node functions/fill_in_the_blanks_preassessment.test.js
# With an isolated local Firestore emulator running:
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-fill-blanks node functions/fill_in_the_blanks_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-fill-web node functions/fill_in_the_blanks_web_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-preassessment node functions/fill_in_the_blanks_preassessment_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 python scripts/test-fill-in-the-blanks-rules.py
# Serve public/ on 127.0.0.1:8769, then run mobile Chromium checks:
node scripts/test-fill-in-the-blanks-browser.cjs
node scripts/test-fill-in-the-blanks-preassessment-browser.cjs
```
