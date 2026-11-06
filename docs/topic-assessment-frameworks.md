# Topic assessment frameworks

Each syllabus topic selects its framework for every supported language:

```text
syllabuses/{syllabusId}/topics/{topicId}
  assessmentFrameworkIds: { english: "framework-id", tamil: "another-framework-id" }
```

Framework definitions remain reusable in `assessmentFrameworks`. Their `frameworkType` determines the question format: `normal` (MCQ), `essay`, or `fillInTheBlanks`. There is no separate topic question-type field or syllabus-level framework default.

In Syllabus administration, choose a framework on each topic/language. Active syllabuses require all assignments; inactive drafts may omit them if no practice is attached. A missing mapping blocks practice generation and initial student assignment. The shared Practice Generator selects its format from the topic framework. Question Generator preview pages remain independent configuration/preview tools.

An attached practice must match the topic framework's type. Remove the initial attachment using the existing Syllabus feature API before changing its format. Existing student assignments, grades, placement snapshots, progress and rewards are retained. Changing framework levels for students who already have progress still requires an explicit transition; this change does not reset or remap their levels.

## Deployment and migration

Run from the repository root using Node 22 and the existing managed Firebase service-account binding:

```sh
bash scripts/migrate-topic-frameworks.sh          # Read-only audit
bash scripts/migrate-topic-frameworks.sh --apply  # Apply compatible mappings
```

Apply the migration before deploying the stricter readers. The migration preserves explicit mappings and copies a legacy syllabus default only when its framework exists and matches any attached practice. It removes the obsolete root field only for fully validated syllabuses. Missing or conflicting references block all application of the plan; select the appropriate topic framework, then rerun the audit. It never guesses a different framework from its type.

Each syllabus commits atomically with update-time preconditions on its root, topics and referenced framework definitions. A concurrent change causes the commit to fail instead of overwriting that change. Earlier syllabuses can have committed if a later syllabus fails; rerunning is safe. The migration never writes student collections, practice content, grades or rewards.

The read-only ReadyHeroX audit on 5 November 2026 found four syllabuses, three topics needing explicit mappings and no attachment-type conflicts. The migration was applied during deployment on 5 November 2026: three syllabuses were updated, and the follow-up audit found no missing mappings or conflicts. Student data was preserved.

## Verification

- `node scripts/migrate-topic-frameworks.test.cjs`: migration decisions, dry-run/apply, type conflicts, idempotency and concurrency preconditions.
- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8093 GCLOUD_PROJECT=demo-rhx-topic-mixed node functions/topic_framework_emulator.test.js`: one syllabus with all three formats, shared reuse, idempotent subscription assignment, missing/mismatched configurations, preserved progress and actual migration commits.
- `node scripts/test-topic-framework-browser.cjs`, with `public/` served on port 8769: actual mobile Syllabus admin page, all three framework groups, required mappings and saving without a subject default. Feature APIs are mocked locally.

Existing web/backend scoring, essay generation, fill-in-the-blanks placement, daily mission and dashboard regressions also cover topic assignments. Generation providers are mocked in tests. No new external HTTP function, feature family or collection is introduced.
