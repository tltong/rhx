# Subject assessment generation and storage

Generation is student-specific. It uses the saved configuration for one syllabus
and language and follows each selected topic's current format. Configuration
changes affect later requests; an in-progress request retains its configuration
snapshot. A changed topic format requires reviewing/saving the configuration
before generating. No assessment framework criteria, level progression, coins,
readiness, reliability, practice assignment, or daily-mission integration is used.
Assessment taking, submissions and scores extend the existing `subject_assessment`
feature; see [subject-assessment-results.md](subject-assessment-results.md).

## Storage

The new schemas are mirrored in `functions/schema/` and `public/config/firebase/`.

| Schema | Path | Contents |
| --- | --- | --- |
| `subject_assessment_schema.js` | `subjectAssessments/{assessmentId}` | Student, syllabus, language, configuration version/snapshot, creator, time and totals |
| | `…/items/{position}` | Ordered frozen question/passage content, topic, difficulty, source reference and reused/generated source |
| | `…/private/{position}` | MCQ answers/explanations and passage model answers |
| `subject_assessment_generation_schema.js` | `subjectAssessmentGenerations/{requestId}` | Reserved assessment ID, frozen configuration, progress, status, lease and failure metadata |
| | `…/items/{position}` | Durable selected items, protected generated drafts and pool-save checkpoints |
| | `subjectAssessmentGenerations/_locks/students/{studentId}` | Renewable per-student generation lease |
| `subject_assessment_usage_schema.js` | `studentSubjectAssessmentUsage/{studentId}/items/{sourceKey}` | Persistent content identities selected for completed generation requests, including assessments not yet taken |

Each item is one MCQ, one essay or one whole passage. Passage snapshots retain
all blanks; `questionCount` includes those blanks, while `passageCount` counts
whole passages. MCQ/essay/passage content remains stable if a pool record is later
edited. Source keys are SHA-256 hashes of format-qualified identities: full MCQ
paths and globally indexed essay/passage IDs. Equal MCQ IDs in different branches
remain distinct.

The `subject_assessment` feature reads assessments and lists them per student.
Its student dashboard overview/start operations now queue generation after
subscription and interval checks; see [student-subject-assessments.md](student-subject-assessments.md).
The `subject_assessment_generator` feature assembles content and owns server-side
persistence, progress and recovery. Completed assessments and usage are published
atomically after all frozen public/private items have been staged. Staged content
is unreadable to students before publication. Clients cannot write these records.
Students/linked guardians may read their published assessments and public items;
generation details, usage and answer keys require a verified administrator.

## Selection and retries

Before paid work, generation verifies the student exists and reads all pages of:

- Assigned and completed MCQ practices and their shared question references.
- Assigned and completed essays, including original source question IDs.
- Assigned/completed passages and the existing durable passage usage ledger.
- Previous subject assessment usage.

History read failures fail the request; they do not become an empty history.
Missing shared MCQ definitions also fail safely because their question identities
cannot be reconstructed. No regular history is copied into the new usage ledger.

Selection reuses random eligible unseen content at each configured topic and
difficulty, excluding repeats within the same assessment. MCQ difficulty matching
accepts legacy casing. Essay/passage reuse also checks current grade support and
blank-count settings. Shortfalls use the existing prompts, validation and model
services; generated content is saved into the existing pools before publication.
Regular practice records and rewards are not written.

Requests use a stable `requestId`. The reserved assessment ID survives failure.
Generated drafts are checkpointed before pool saving, and retries resume them
without regenerating already checkpointed content. Lease guards reject stale
workers and concurrent requests for the same student. History is read again
before publication; newly assigned content causes a retry rather than a repeat.
Completed requests return the existing assessment without new generation.

Backend feature APIs, requiring a verified administrator context:

```js
generateSubjectAssessment({studentId, syllabusId, language, requestId}, {updatedBy: adminUid})
retrySubjectAssessmentGeneration({studentId, syllabusId, language, requestId}, {updatedBy: adminUid})
getSubjectAssessmentGeneration({generationId: requestId}, {updatedBy: adminUid})
getSubjectAssessment({assessmentId}, {updatedBy: adminUid})
listStudentSubjectAssessments({studentId, limit: 20, cursor}, {updatedBy: adminUid})
```

## Admin demo

The existing Subject Assessment Configuration admin page now has **Demo
generation**. Save the configuration, choose **Level → Grade → Student name**,
and select **Generate Demo**. Grade uses the existing current-grade calculation,
not the student's registration grade. Names are filtered by the selected level
and grade; duplicate names include their usernames or IDs for identification.
Student selection supplies the student's ID to the generator automatically.
Reload Students refreshes the read-only list and clears any previous selection.
The page shows progress and all three formats, with reused/generated
counts and optional model-answer disclosure for administrators. Editing the
configuration, student filters, selected student or language clears stale previews. Failed generation can
be retried without losing the configuration form.

The administrator demo module exposes only `previewSubjectAssessment`.
It requires administrator access, checks the same student history and selects
using saved settings, but keeps drafts and output solely in browser memory.
The demo writes no assessments, usage, jobs, drafts, pool content, image-asset
records or Storage objects. Optional pictures use the existing stateless image
service and remain in memory. Model services may still be called for shortfalls.
There is no Save Assessment control. Preview cannot be switched into persistence
by passing options. Backend persistent generation remains a separate feature API;
the results extension adds one authenticated assessment callable and one marking
trigger. Student starts queue approved backend generation jobs through the
assessment callable; the administrator demo remains a no-write preview.

## Essay topic compatibility

Essay questions now optionally retain `syllabusId`, `topicId`, `topicName` and
`subject`. Topic-specific generation passes that context into the existing essay
prompt. Initial and follow-up regular essay generation also preserve the context
for newly generated content, and regular reuse avoids explicitly tagged questions
from another topic. Legacy untagged essays remain valid for existing practice;
subject assessment reuse requires a verified topic association. Nothing guesses
or backfills associations for old questions. The existing essay pool/index paths
remain unchanged. A collection index for syllabus/topic/difficulty is included
in `firestore.indexes.json`.

New assessment essays select a **theme** seed assigned to the syllabus level
and grade, matching regular essay practice. Setting and type seed associations
are not prerequisites. If no theme is assigned, generation reports the missing
theme for that level and grade before calling the model. Existing reusable
questions do not need a new seed selection.

## Verification and release

Use Node 22 and a local Firestore emulator with a `demo-` project. Providers are
mocked in these tests; no production model requests or database writes are made.

```sh
node functions/features/subject_assessment_generator/subject_assessment_generation.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-subject-generation node functions/subject_assessment_generation_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 node functions/subject_assessment_config_rules_emulator.test.js
# Serve public/ at http://127.0.0.1:8769 first:
node scripts/test-subject-assessment-demo-browser.cjs
node scripts/test-subject-assessment-config-browser.cjs
```

The emulator tests compare every database document before and after reused and
new-content demos, including picture-enabled previews. They cover durable retry,
same-student concurrency, history exclusions, private answers, frozen content,
student isolation and browser/backend compatibility. Rules tests cover student,
guardian, stranger, anonymous and administrator access. Existing essay generation
and configuration regressions are also run.

Release requires the new rules, essay index and Hosting assets together. Keep
backend feature code aligned with the web essay contracts when deploying Functions
later.

Released to ReadyHeroX on 8 November 2026. Hosting version
`889765678be35414` published the configuration page, cascading student selectors
and preview-only demo. All 39 changed public files matched the released source
byte-for-byte, the essay index was READY, the Firestore rules matched the tested
version, and all eight affected Node functions were verified ACTIVE. A fresh
anonymous browser confirmed the admin access guard. Demo generation still makes
no assessment, usage, question-pool, draft or image-storage writes.

The 8 November 2026 seed-selection correction was published in Hosting version
`d4dcc325879501e2`. Live Primary 4 data contained eight eligible theme seeds
and no eligible setting or type seeds. The demo had incorrectly called the
combined selector, which requires all three categories. Both runtime adapters
now select a grade-specific theme, matching regular essay practice; seed data
was not changed. Primary 4 browser/backend regression tests, the nine emulator
tests and both admin-page browser checks passed. All five updated Hosting
assets matched the tested source after publication.

The complete student dashboard, generation worker, submission/marking/results
and global interval configuration were released on 8 November 2026 in Hosting
version `bd8db38cbfdfd9a0`. See [student-subject-assessments.md](student-subject-assessments.md)
for the deployed APIs, verification and global-interval setup requirement.
