# Subject assessment submissions, marking and results

This extends the existing `subject_assessment`, `essay_scoring` and passage-view
code. There are no new feature directories. MCQ comparison stays in the assessment
feature, essay marking uses the existing scorer and instructions, and passage
marking uses the existing exact-match/alternative-answer marker.

Two schemas are mirrored in `functions/schema/` and `public/config/firebase/`:

| Schema | Storage | Contents |
| --- | --- | --- |
| `subject_assessment_submission_schema.js` | `subjectAssessmentSubmissions/{assessmentId}` | Student/syllabus/language, answer revision, draft/submitted status, server times, duration and safe marking progress |
| | `…/items/{position}` | Selected MCQ option, exact essay text or blank-ID answer map |
| | `…/private/marking` | Frozen essay/passage settings and scoring policy, lease and safe failure code |
| | `…/private/marking/items/{position}` | Completed item marks retained across retries |
| `subject_assessment_result_schema.js` | `subjectAssessmentResults/{assessmentId}` | Percentage, earned/max marks, counts, policy and topic/format/difficulty breakdowns |
| | `…/items/{position}` | Submitted answers, per-item marks, correct options/model blank answers, essay review and corrections |

One generated assessment belongs to one student and accepts one final submission.
An assessment must be persisted by the existing backend generator before it can
be taken. The admin generation demo remains a no-write preview and cannot create
a submission. The student dashboard can now request eligible generation through
the [student assessment APIs](student-subject-assessments.md).

## Scoring

The default policy is version 2, **equal weight per topic**. First calculate each
topic percentage from its earned/max marks, then average the topic percentages.
Every selected topic contributes `1 / numberOfTopics`, regardless of its question
or passage count. Within a topic, each MCQ, essay and individual blank carries
one mark; an essay scored 80% earns 0.8 marks. Stored scores are not rounded.
For example, topic scores of 100%, 80% and 100% produce
`(100 + 80 + 100) / 3 = 93.33…%`, even if one topic has more questions.
Passage selection is still configured in whole passages. Blank answers and empty
essays score zero without paid work. Raw earned/max totals remain available but
their ratio does not define the overall percentage under this policy.
The result stores the policy used; previously frozen version-1 policies retain
their original question-weighted calculation. Topic, format and difficulty
breakdowns show their own earned/max marks and percentages. There is no level progression,
assessment framework, coin, readiness, reliability, practice assignment or mission
write. Normal practice results and the generation usage ledger are untouched.

New assessments freeze level, grade, subject and country at generation time.
Marking uses frozen public content and private answer keys, never live bank
content. Legacy essays can derive the original level/grade from their immutable
source path. Missing grade metadata fails marking rather than guessing the
student's current grade. Essay and passage marking settings are frozen on the
first successful submission and reused for every retry.

## Sessions and recovery

Draft saves use `expectedRevision` to reject concurrent stale writes. Answers
are validated against the assessment's item positions and formats. Drafts allow
incomplete passage text; submission enforces the existing word/Chinese-character
counts and allows unanswered blanks. Essay whitespace is preserved for exact
correction references; minimum-length instructions remain part of marking rather
than blocking a shorter response. A request can save up to 350 item answers; larger
assessments save successive chunks, then submit the saved draft. Total answer
payload is bounded to 750 KB. Time taken is server elapsed time from the first
draft save, including time away from the page.

Submission atomically locks answers and queues marking. Repeating submission
returns the original answers and never creates another result. A Firestore
trigger starts only when the marking request changes; progress updates do not
start new work. A renewable four-minute lease prevents concurrent workers. Each
successful item is checkpointed. A failure exposes safe retry guidance and
retains those marks. Explicit retry resumes the saved submission. A process crash
is retried by the trigger after its lease expires; a replacement worker prevents
stale writes. Long assessments queue continuation after a processing budget, so
they can finish across function invocations. A model response lost before its
checkpoint may need to be requested again.

Result items are staged behind an unpublished parent. The result summary is
published only when every item is marked, together with completed submission
status. Clients cannot write submissions, marking state or scores directly.
Students and active linked guardians can read their own submissions/results;
guardians are read-only. Verified administrators may inspect and submit. Private
settings/checkpoints require administrator access. Existing billing access checks
apply. Browser mutations use the authenticated callable; student identity is
derived from the assessment and authenticated account, not trusted client fields.

## APIs and page

The existing feature module exposes:

```js
getSubjectAssessment({assessmentId})
listStudentSubjectAssessments({studentId, limit, cursor})
getSubjectAssessmentSession({assessmentId})
getSubjectAssessmentTutorQuestion({assessmentId, position})
saveSubjectAssessmentAnswers({assessmentId, expectedRevision, answers})
submitSubjectAssessment({assessmentId, expectedRevision, answers: []})
retrySubjectAssessmentMarking({assessmentId})
getSubjectAssessmentResult({assessmentId})
listStudentSubjectAssessmentResults({studentId, limit, cursor})
```

Each answer is `{position, selectedOption}`, `{position, answer}` or
`{position, answers: {blankId: text}}`. Backend callers pass a trusted
`{auth: {uid}}` context (or a verified server administrator context). The browser
uses the `subjectAssessment` callable and cannot invoke marking or save scores.
The backend-only `markSubjectAssessmentSubmission(assessmentId, {markingRequest})`
is invoked by `onSubjectAssessmentSubmitted`.

The student dashboard links to
`/features/subject_assessment/pages/assessment/subject_assessment.html`.
Add `?assessmentId=...` to open an assessment or `studentId=...` for an authorized
guardian/administrator view. The page lists assessments/results, autosaves and
resumes drafts, locks submitted fields, polls marking, offers retry on failure
and shows percentages, breakdowns and feedback. A lost submission response is
reconciled before editing is allowed. Concurrent-save conflicts retain local
text and require explicit reload. Account changes clear previously rendered
answers. Passage rendering is reused with unique DOM IDs for each passage.

Published results offer **Review this question** for incorrect or unanswered MCQs
when the topic's current **Enable tutor** setting is on. Correct MCQs, essays,
fill-in-the-blanks passages and assessments awaiting marking do not offer Tutor.
Session reads add transient `tutorEnabled` and `tutorQuestionId` fields to eligible
items; these fields are never persisted with the assessment or result. Topic
configuration failures hide the optional link while leaving scores readable.

The existing `subjectAssessment` callable action `tutor` accepts only
`{assessmentId, position}`. It enforces student/linked-guardian/administrator
access, active learning subscription and published-result eligibility, then
returns the frozen MCQ, marked answer/explanation, diagram and current topic flag.
It never looks up question-bank content, which may have changed or been removed.
Unpublished staged result items cannot expose answers through this operation.

The existing Tutor page and generation/checking use cases are reused through an
authorized question-loader adapter. Every guidance load, generation and answer
check revalidates the assessment and current topic switch, including cache hits.
The saved Tutor Admin configuration supplies the instructions, question count
and language-specific feedback. **More guidance**, count/language variants and
return links to the originating assessment result behave as in regular practice.
Tutor guidance uses the [shared Tutor cache](topic-tutor-availability.md#shared-guides-across-practice-and-subject-assessments)
in the existing `tutor/{guideId}/counts/{count}/languages/{languageId}` structure.
Matching frozen assessment and bank question content, generation instructions,
language and count reuse the same saved guide across students and assessments.
Assessment routing IDs remain `assessment-` plus SHA-256 of the JSON array
`[assessmentId, position]`; they identify the authorized item independently of
the cache key. Answer checks pin the loaded `guideId`, so an instruction change
cannot switch a review's answers. Tutor does not store student responses or
change assessment scores.

The Tutor extension requires Hosting and the existing `subjectAssessment` function
to be deployed. It introduces no new schema, collection, rule, index or migration.

Released on 9 November 2026 in Hosting version `5abed2cc034be681` and
`subjectAssessment` revision `subjectassessment-00004-qew`. Verification matched
all nine updated public assets, confirmed the active backend and callable
authentication guard, and checked the live assessment/Tutor sign-in protections
with no uncaught browser errors. Other functions, Firestore rules and the saved
repeat policy were unchanged.

Hosting version `8aae33ed88231476` (9 November 2026) adds the Firebase Functions
compat SDK to the Tutor review page. The missing dependency caused
`getFirebaseApp(...).functions is not a function` for assessment reviews; the
earlier mocked browser transport did not exercise SDK registration. The real-SDK
browser regression reproduces the original failure and verifies the correction
both locally and against the deployed HTML, with only the callable response
simulated. The existing Tutor flow and sign-in protections also pass. This
correction changes only the Tutor HTML; backend functions, rules and repeat
configuration remain unchanged.

After a student's own submission is confirmed, the page clears its pending
autosave/unsaved-change state and immediately replaces the current browser-history
entry with the student dashboard. It does not wait for marking or another session
read. The existing backend submission trigger continues marking independently.
The dashboard shows marking progress and automatically refreshes the score and
result link when marking completes. Processing polls every five seconds at first,
then once a minute for longer work; transient status failures are retried.

A lost submit response is checked against the saved session: a confirmed submitted
record returns to the dashboard, while a rejected submission retains local answers
for retry. If status cannot be confirmed, answers remain on the page and a status
check is required; confirmation of the saved submission then returns the student.
Opening a submitted assessment from history continues to show its answers and
feedback. Authorized staff review is retained. This navigation/polling extension
was released on 9 November 2026 at 08:46 UTC in Hosting version
`690995fea1e428dd`. All five updated public assets matched the tested source, and
live access checks passed for the assessment page, dashboard and admin page with
no uncaught browser errors. The release updated Hosting only; functions and rules
were unchanged. No new API, schema, or backend worker was needed.

## Validation and deployment

Use Node 22 with a local Firestore emulator and isolated `demo-` projects:

```sh
node functions/features/subject_assessment/subject_assessment_submission.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-subject-results node functions/subject_assessment_results_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 node functions/subject_assessment_config_rules_emulator.test.js
# Serve public/ on port 8769:
node scripts/test-subject-assessment-session-browser.cjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-tutor node functions/subject_assessment_tutor_emulator.test.js
node scripts/test-subject-assessment-tutor-browser.cjs
# With actual 12.15.0 app/auth/firestore/functions compat SDK bundles cached in
# /workspace/.rhx-tools/firebase-compat/12.15.0 (or SUBJECT_ASSESSMENT_TEST_SDK_DIR):
node scripts/test-tutor-firebase-bootstrap-browser.cjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-shared-tutor node functions/tutor_shared_guide_emulator.test.js
```

Integration tests cover all formats, frozen content/settings, zero-mark answers,
retry checkpoints, parallel tabs/workers, lease replacement, continuation,
guardian/billing access and unchanged normal practice data. Rules tests cover
all new paths, forged writes and unpublished results. Browser checks cover
save/resume, validation, lost-response recovery, retries, safe text, unique blank
IDs, read-only access and responsive layouts. Existing scoring/generation/demo
regressions are also run; model providers are mocked.

Deployment requires updated Firestore rules, Hosting, `subjectAssessment` and
`onSubjectAssessmentSubmitted` (the trigger needs the existing DeepSeek/OpenAI
secrets and retry policy). Existing essay function deployments should include the
backward-compatible scorer extension. No new Firestore composite index is needed
for the unfiltered student-ID/document-ID queries. Subject-filtered history in the
student dashboard extension adds student-ID/syllabus-ID indexes. This results
extension was released with the student dashboard on 8 November 2026.
