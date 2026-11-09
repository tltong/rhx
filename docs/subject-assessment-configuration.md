# Subject assessment configuration

There is one global assessment repeat policy, independent of the subject/topic settings:

```text
subjectAssessmentSettings/config
```

It stores `repeatMode`, `intervalDays`, `version`, `createdAt`,
`createdBy`, `updatedAt` and `updatedBy`. The policy applies to every subject,
grade, language and student. There are no per-subject or student overrides.

| repeatMode | intervalDays | Behavior |
| --- | --- | --- |
| `interval` | Positive safe integer | Wait this many elapsed days after submission before another assessment for the same subject. |
| `none` | `null` | Allow the initial assessment, then reject further starts after submission. |

Legacy records containing only a valid positive `intervalDays` value are read as
`interval` mode without rewriting the record. An absent document is unconfigured;
reads invent no default. A null interval alone does not enable initial-only mode:
the administrator must explicitly choose `none`.

The existing admin page has a **Global assessment repeat policy** form with independent
save and reload controls. No subject/language selection is needed. Administrators
choose **Repeat at an interval** or **No repeat (initial only)**; the day input is
shown and required only for interval mode. Values must be positive whole days.
Saving preserves creation
metadata, increments the global version and rejects concurrent stale edits.
Failed saves retain the selected mode and entered value. A failed initial load must be retried
before saving, so an unknown existing setting cannot be overwritten.

The existing `subject_assessment_config_schema.js` describes both global settings
and subject allocations; no new feature or schema file is introduced. The existing
feature exposes `getSubjectAssessmentSettings()` and
`saveSubjectAssessmentSettings({repeatMode, intervalDays, expectedVersion})` in the browser.
Legacy interval-only save inputs remain supported.
Backend reads take an administrator context, and saves accept that context as the
second argument. Global reads/writes require a verified site administrator; rules
also prevent deletion, forged metadata and alternate settings/override paths.

The student dashboard overview and start APIs now consume this shared setting for
eligibility and repeat attempts; see [student-subject-assessments.md](student-subject-assessments.md).
Generation previews and result scoring do not depend on the repeat policy.
Existing assessments remain resumable and existing results remain readable when
the policy changes. Reactivation retains history, while unsubscribe cleanup and
resubscription permit a fresh initial assessment under the agreed subscription
lifecycle. The original interval setting was released on 8 November 2026. The
interval/no-repeat extension was released on 9 November 2026 at 06:33 UTC in
Hosting version `3ca31a3abd142c92`, together with automatic subscription generation.
All 12 updated public assets and the deployed rules matched the tested source;
all three selected functions were ACTIVE, and live browser access checks passed.
The saved global policy was preserved. Release Hosting, Firestore rules and the
assessment callable/automatic subscription queue handlers together. No new
collection, index or migration is required.

One configuration is saved per syllabus and syllabus language at:

```text
subjectAssessmentConfigs/{syllabusId}/languages/{normalizedSyllabusLanguage}
```

The normalized language key uses the existing syllabus normalization. Case and
surrounding whitespace do not create alternate configurations. The saved language
uses the syllabus's canonical spelling. Different syllabuses and languages have
separate configurations; there are no named alternate configurations.

Administrators select topics and enter a positive total with nonnegative whole
counts for easy, medium and hard. The three difficulty counts must sum exactly to
the total. Selected topics must belong to the syllabus and cannot repeat.

Each selected topic follows its existing format for that language. The existing
topic-to-framework mapping supplies only the format (`normal`, `essay`, or
`fillInTheBlanks`). No framework levels, difficulty criteria, promotion rules or
placement mappings are used. The saved topic format is derived, not an override.
Totals count questions for MCQ/essay and whole passages for fill-in-the-blanks.
Blank counts continue to belong to the existing passage generator configuration.

The repository rechecks the syllabus language, selected topics and current format
inside the save transaction. A changed format rejects a stale form. Configuration
versions start at one; clients supply `expectedVersion` (zero for a new config).
Concurrent edits reject stale saves rather than overwriting them. Creation
metadata is retained and update metadata records the saving administrator.

The admin page is linked from Site Admin under Syllabus Related:
`/features/subject_assessment_config/pages/admin/subject_assessment_config_admin.html`.
It shows formats automatically, validates counts, displays questions and passages
separately, retains edits after failed saves and while switching subjects/languages,
and offers Reload Saved. Unavailable or removed saved topics must be deselected.

The `subject_assessment_config` feature has matching web/backend schema, domain,
service, repository and module contracts. Its APIs are
`getSubjectAssessmentConfig`, `getSubjectAssessmentConfigOptions`, and
`saveSubjectAssessmentConfig`. Configuration reads and writes require verified
site administrators. Firestore rules protect the complete new collection root
from the existing permissive fallback. No new HTTP endpoint is introduced.

The configuration feature does not create practices, assign daily missions,
score results, award coins, calculate reliability, or change student levels.
No existing data needs migration. The admin page also offers a separate,
in-memory-only generation demo; see [Subject assessment generation](subject-assessment-generation.md)
for its zero-write contract, generation/storage features and release requirements.

## Verification

Use Node 22 and an isolated local Firestore emulator; all projects below use the
`demo-` prefix. No paid model services or production database are used.

```sh
node functions/features/subject_assessment_config/subject_assessment_config.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-subject-config node functions/subject_assessment_config_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 node functions/subject_assessment_config_rules_emulator.test.js
# Serve public/ at http://127.0.0.1:8769 first:
node scripts/test-subject-assessment-config-browser.cjs
```

The browser test uses the actual page and local feature API mocks. The emulator
test exercises real web/backend APIs, format inheritance, singleton saves,
language isolation, changed topic formats, concurrent edits and preserved
learning records. The rules test checks administrator-only access, immutable
creation metadata, versioned updates and protected fallback paths.
