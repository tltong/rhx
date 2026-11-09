# Student subject assessments on the dashboard

Students can start or resume a subject assessment in the dashboard's dedicated
**Subject Assessments** section. It groups all subscribed subjects with subject
names, languages and a subject count before the detailed practice progress panels.
The existing `subject_assessment` feature exposes two additional operations
through the authenticated `subjectAssessment` callable:

```js
getStudentSubjectAssessmentOverview()
startStudentSubjectAssessment({syllabusId, requestId})
```

The overview returns one batch containing the current student's subscribed
syllabuses, their subscription languages, whether configuration is available,
`canStart`, `reason`, `lastSubmittedAt`, `nextAvailableAt`, `activeAssessment`,
safe `generation` progress, `latestSubmission` marking progress and `latestResult`.
It uses a consistent database transaction so question publication or marking
cannot produce contradictory availability/result states across its reads. No
answer keys, drafts, leases, marking settings or configuration snapshots are
returned. Overview does not create jobs or assessments.

Start derives the student UID from authenticated context and the assessment
language from the active syllabus subscription within the current stream/year. It accepts no
student-ID or language override. Disabled accounts, inactive billing and subjects
outside the current subscription cannot start work. Background generation checks
the same access before paid work and again before publication.

## Automatic preparation on subscription

Creating an active `syllabusSubscriptions/{studentId}/syllabuses/{syllabusId}`
document automatically queues a subject assessment through
`onSubjectAssessmentSubscriptionCreated`. This retryable create-only trigger
uses the existing `subject_assessment` service, generation queue and worker. It
runs independently of regular topic pre-assessment assignment, so missing regular
pre-assessments do not block preparation of the overall subject assessment. No
new callable API or top-level collection is introduced.

New subscriptions and resubscriptions generate an assessment when subject
configuration, the global repeat policy and student access are valid. Missing
or invalid configuration skips generation and leaves the subscription intact;
the dashboard shows **Subject assessment is not configured yet**. Once configured,
the student can start through the existing dashboard controls. Reactivation is
an update to an existing subscription, so it retains assessments and results.
The repeat interval starts on submission, never on generation.

The server derives a stable request ID from the student, syllabus and Firestore
subscription creation timestamp, preserving nanosecond precision. Queue jobs
record `origin: subscription` and `subscriptionKey: seconds:nanoseconds`;
manually started student jobs record the same subscription key and
`origin: student`. Duplicate deliveries and concurrent student clicks share the
existing pending or unfinished attempt. Delayed create events do not start a
second assessment after an earlier one has been submitted, even after cooldown.

The queue transaction, worker authorization and generation publication guards
check the current subscription. An event from an unsubscribed or replaced
subscription cannot queue or publish an old assessment. Model failures retain a
retryable attempt using the existing dashboard controls; duplicate subscription
events do not automatically requeue that failed work. Existing jobs without
subscription keys remain compatible.

This extension was released with the repeat-policy setting on 9 November 2026
in Hosting version `3ca31a3abd142c92`. Deployment uses the new
`onSubjectAssessmentSubscriptionCreated` function, updated
`subjectAssessment` and `onStudentSubjectAssessmentRequested` functions, and
Hosting for the explicit configuration message. The new event handler only queues
work and needs no model secrets; the existing generation worker retains its
DeepSeek/OpenAI bindings. No new Firestore rules or indexes are required.

## Unsubscribe and remove assessment history

The existing syllabus-subscription feature now exposes the authenticated callable
`unsubscribeStudentSyllabus({studentId, syllabusId, requestId})`. A verified site
administrator or an enabled guardian with an active guardian/student link can
invoke it. Billing access is not required to unsubscribe. Student accounts and
unrelated guardians cannot use this destructive operation. The guardian link is
checked again inside the unsubscription transaction.

The response is `{studentId, syllabusId, unsubscribed: true, cleanupStatus}` with
`cleanupStatus` equal to `completed` or `pending`. The operation atomically
deletes that syllabus subscription and fences subject-assessment writes, then
recursively deletes every matching assessment, submission, answer, result,
private key, marking checkpoint and generation job across all languages. A
generation job's reserved assessment ID also identifies unpublished staged items
whose parent document does not exist yet. Cleanup releases only the affected
subject's generation lease and clears its submission/interval coordination state.
Shared pools, question-usage history, configuration and regular practice remain.

Cleanup uses the existing protected student/subject coordination document under
`subjectAssessmentGenerations/_students/students/{studentId}/subjects/{syllabusId}`.
Its `cleanup` field holds status and a renewable lease; `cleanupItems` temporarily
stores the deletion manifest before any generation pointer is removed. Completed
targets are removed from that manifest. Minimal `unsubscriptions/{requestId}`
receipts remain so a lost-response retry cannot unsubscribe a newly recreated
subscription. A new unsubscription after resubscribing must use a new request ID.

`onStudentSyllabusUnsubscribed` observes new pending cleanup state and retries
interrupted work, including expired leases. Ordinary state changes and lease
renewals do not queue cleanup. Start, generation, answers and marking are fenced
by transactional checks; old workers and stale sessions cannot restore deleted
assessment records. Subscription recreation is blocked until cleanup completes.
Assessment eligibility now requires an active syllabus subscription as well as
membership in the student's current stream/year.

The Student Syllabus Subscriptions page and the admin subscription page use this
backend operation through the existing `unsubscribeSyllabus` facade. The browser
keeps the request ID through failures/reloads and reports pending cleanup. It no
longer deletes subscriptions directly; Firestore rules require the backend delete
flow. **Deactivate** retains assessment history. Resubscribing after completed
cleanup allows a fresh assessment without the deleted history's cooldown.

This change requires deployment of Hosting, Firestore rules, the updated
`subjectAssessment`, `onStudentSubjectAssessmentRequested` and
`onSubjectAssessmentSubmitted` functions, and the new `unsubscribeStudentSyllabus`
callable and `onStudentSyllabusUnsubscribed` cleanup worker. No new composite
indexes or model-provider secrets are required. Deploy the backend before the
updated pages and enforce the rules with that release.

The unsubscription extension was released on 8 November 2026 at 17:19 UTC in
Hosting version `7fb6176d31bfcf21`. All five selected functions were ACTIVE, the
cleanup trigger and retry policies matched, all eight updated public assets
matched the tested source, and ruleset
`8df560f1-1e13-4b66-898a-ca9c8380a0db` matched the tested rules. The live callable
rejected unauthenticated requests. Anonymous browser checks passed for both
subscription pages and the student dashboard with no uncaught errors. Deployment
verification did not unsubscribe any students or delete assessment records.

## Availability and repeat attempts

All subjects share `subjectAssessmentSettings/config`. It contains
`repeatMode: interval` with positive `intervalDays`, or `repeatMode: none` with
`intervalDays: null`. Legacy records with only a positive interval are treated as
interval mode without being rewritten. Overview includes the effective
`repeatMode` and `intervalDays` alongside subject availability.

Eligibility is calculated separately for each `(studentId, syllabusId)`, across
languages. In interval mode:

```text
nextAvailableAt = latest submittedAt for this subject + intervalDays × 24 hours
```

The first assessment is available immediately when both the global repeat policy
and the subject/language allocation are configured. There is no implicit policy.
The server rejects early starts and checks the exact elapsed-time boundary.
Submitting starts the interval; marking completion does not change it. A pending
or failed mark can coexist with eligibility for the next assessment. The current
global interval applies to future start checks, including after an administrator
changes it. Changing the subscription language does not reset a subject's wait.

In no-repeat mode, an initial assessment can be prepared automatically or started
manually. Once any assessment for that subject is submitted, new starts are
rejected with `failed-precondition`, overview returns `reason: noRepeat`, and
`nextAvailableAt` is null. Marking progress and results remain available. The
restriction spans subscription languages and does not expire with elapsed time.
Each other subject still has its own initial assessment. The current policy
applies to future start checks; changing back to interval mode uses existing
submission timestamps to calculate eligibility. Already queued or unfinished work
remains resumable when policy changes. Unsubscribe cleanup followed by
resubscription permits a fresh initial assessment.

Published unsubmitted assessments are resumed rather than replaced, including
assessments generated earlier through the administrator feature. Existing work
can be resumed when new-generation configuration is unavailable. Repeated start
requests return the same queued generation or unfinished assessment. A completed
request ID always returns its original assessment; use a fresh request ID for a
later eligible attempt.

## Generation and coordination

The existing generation schema is extended; no new feature or schema file is
introduced. Student requests are stored at
`subjectAssessmentGenerations/student-{hash(studentId, requestId)}` with
`entryPoint: "student"`, `clientRequestId`, `generationRequest`, a reserved
assessment ID, frozen configuration/context and `queued` status. Request IDs
cannot be reused for another subject.

Protected subject coordination is stored at:

```text
subjectAssessmentGenerations/_students/students/{studentId}/subjects/{syllabusId}
```

It records the active generation and last submission metadata. Start reserves
this state and the job in a transaction; even different request IDs in parallel
tabs produce one job. Submission updates the same state atomically with locked
answers, preventing a simultaneous start from bypassing the interval. Assessment
publication clears the generation pointer in the publication transaction. The
private state remains server-owned and administrator-readable under the existing
generation rules. Legacy assessment/submission history is also consulted, so
missing coordination records do not reset eligibility or abandon unfinished work.

`onStudentSubjectAssessmentRequested` starts only student jobs with a new queue
request number. It invokes the existing generator with trusted ownership and
subscription checks; the administrator generator API remains admin-only. The
existing student-wide lease serializes generation across subjects. Busy leases
are retried by the event worker. Successful item checkpoints survive provider
failures and process interruption. Long generation queues continuation after a
processing budget and releases the lease; a later invocation resumes checkpoints.
Old request events and replaced workers cannot publish. An explicit retry requeues
the same active job, retaining its reserved assessment and completed items. Failed
provider requests expose safe retry guidance and await a student retry. A model
response lost before its checkpoint may need another provider call.

The published assessment, reusable question pools, usage ledger, frozen content,
submission/marking/result stores and equal-topic scoring remain as described in
[generation](subject-assessment-generation.md) and [results](subject-assessment-results.md).
There are no regular practice assignments, missions, coins, reliability,
readiness or progression writes.

## Dashboard and history

Each assessment card shows Take assessment, Start/Resume assessment, preparation
progress, marking progress/retry, the next available date, the latest available
score and links to the result and subject history. A previous score remains
visible while a newer submission is being marked. The page batches overview
refreshes, polls active work, refreshes availability at the interval boundary and
rechecks when the tab becomes visible. Assessment failures have their own retry
controls and do not stop the rest of the learning dashboard. Pending actions are
disabled to prevent repeated clicks; lost start responses reconcile through the
overview. Sign-out stops polling and clears rendered assessment data.

Submitting an assessment returns its student immediately to this dashboard after
the backend confirms that answers are saved. Marking runs independently, and the
card updates automatically when a result is ready. Active generation/marking uses
five-second polling for the initial ten minutes, then one-minute polling until it
finishes; temporary availability-read failures are also retried. A failed or
unconfirmed submission retains answers on the assessment page until it can be
confirmed. This return-to-dashboard extension was released on 9 November 2026 at
08:46 UTC in Hosting version `690995fea1e428dd`. All five changed assets matched
the tested source; live assessment/dashboard/admin access checks passed without
uncaught browser errors. Functions and Firestore rules were unchanged.

The existing assessment page accepts `syllabusId` as a history filter, preserving
it when opening an assessment/result. Both `listStudentSubjectAssessments` and
`listStudentSubjectAssessmentResults` accept this optional filter. Existing
student/guardian/admin ownership checks still apply to historical reads. Students
cannot invoke backend marking or persist results through callable actions.

## Validation and deployment

```sh
node functions/features/subject_assessment/student_subject_assessment.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-student-subject node functions/student_subject_assessment_emulator.test.js
# Serve public/ locally on port 8769:
node scripts/test-subject-assessment-dashboard-browser.cjs
node functions/features/syllabus_subscription/syllabus_unsubscription.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-syllabus-unsubscribe node functions/syllabus_unsubscription_emulator.test.js
node scripts/test-syllabus-unsubscription-browser.cjs
node functions/features/subject_assessment/subscribed_subject_assessment.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-subscription-assessment node functions/subscribed_subject_assessment_emulator.test.js
```

Tests exercise real queue/generation/publication/submission/marking adapters with
mocked model providers. They cover interval boundaries, concurrent starts, request
identity, subscription/language isolation, bank reuse, result availability, failed
generation, continuation and unchanged regular practice state. Existing generation,
marking, permissions, student dashboard and admin preview regressions are run too.

Deployment needs Hosting, the updated `subjectAssessment` callable, the new
`onStudentSubjectAssessmentRequested` worker, the previously added marking worker
and Firestore rules, plus three student-ID/syllabus-ID collection indexes for
assessments, submissions and results. Generation/marking workers use the existing
DeepSeek/OpenAI secret bindings.

Released to ReadyHeroX on 8 November 2026 in Hosting version `bd8db38cbfdfd9a0`. All 26 changed public assets matched the tested source, all four deployed functions were ACTIVE, the three assessment indexes were READY, and the rules matched the tested source. Live anonymous browser checks passed for the student dashboard, assessment page and admin access guards. The callable rejected unauthenticated requests. No student assessments or results were created during deployment verification.

The grouped dashboard assessment section was released the same day in Hosting
version `49b905732f45baa6`. All four updated public assets matched the tested
source. Dashboard browser coverage verifies that each subscribed subject has a
named assessment card in the dedicated section, outside the topic progress
panels, on mobile and desktop. This layout update changes no subscriptions or
assessment configuration.

The global repeat policy is managed in Subject Assessment Configuration. The
initial interval release left it unset for administrators to configure. The
no-repeat extension was released on 9 November 2026 at 06:33 UTC in Hosting version
`3ca31a3abd142c92`, including the updated settings admin page/schema, student
dashboard, rules and backend availability/start logic. All three selected
functions were ACTIVE, both generation triggers matched their expected document
filters and retry settings, and the assessment callable rejected unauthenticated
requests. All 12 updated public assets matched the tested source. Ruleset
`9dc3f281-829d-4eb4-bc2e-2607cae25755` matched the tested rules. Browser access
checks passed for admin, student and guardian pages with no uncaught errors.
Read-only deployment verification preserved the saved global policy and did not
create assessments or change student enrollments.
