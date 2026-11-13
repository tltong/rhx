# Essay configuration

`essay_config` owns shared essay settings, a reusable type catalog, and grade
configuration. The existing **Site Admin → Essay Admin** page edits all three
and retains the question generation, preview and save tools.

## Storage and schemas

The schemas live in `functions/schema/essay_config_schema.js`, mirrored under
`public/config/firebase/`. The collections are:

| Document | Contents |
| --- | --- |
| `essayTypes/{id}` | Name, type instructions, instructions keyed by grade document ID, picture requirement (`optional` or `required`), frame count |
| `essayGradeConfigs/{level}_{standard}` | Level, grade, shared grade instructions, minimum words, helping suggestions, available essay-type references |
| `essayConfig/settings` | Common instructions, difficulty instructions, schema version, configuration revision |

Each grade has `essayTypes: [{essayTypeId, pictureEnabled}]`. IDs reference catalog
documents, with no fixed type enum. Being listed makes a type available. There is
no separate enabled flag and no grade-wide picture setting. Photo choices can vary
for the same type across grades. Type-specific grade instructions belong to the
type document's `gradeInstructions` map (for example `primary_3`). All configuration
applies across languages.

A required-picture type cannot be assigned with `pictureEnabled: false`. Multi-frame
types require pictures. The admin checks and locks their photo controls. Server-side
validation also rejects missing/duplicate type references, invalid grade references,
invalid frame/suggestion counts, and invalid minimum words.

The initial catalog provides normal essay, finish the story, reply to an email,
write a letter, and a four-frame picture story. Additional document IDs and type
instructions are supported without changing the grade schema. The same written
response/image interface handles these types; a new response interaction may
require renderer and marking changes.

## APIs and permissions

Backend: `functions/features/essay_config/essay_config_module.js`.
Frontend: `public/features/essay_config/essay_config_module.js`.

- `getEssayConfiguration()` returns the catalog, all twelve grade configurations,
  shared settings, and `version`.
- `saveEssayConfiguration({...configuration, expectedVersion})` atomically saves
  the catalog, grades and shared settings. A stale revision returns `aborted`.
- Trusted backend generation uses `loadEssayConfiguration()` or
  `getGeneratorConfiguration()`; the latter projects compatibility fields for
  existing practice and assessment integrations without duplicating stored data.

The signed-in callable `essayConfig` accepts the first two actions. Writes check
Firebase Auth account state, verified email and site administrator membership.
Browser clients cannot directly write any of the three collections. Audit UID and
timestamps are supplied by the backend. Reads retain the existing signed-in
configuration access. The browser SDK wrapper checks for account changes and lazily
loads the Functions SDK on older student pages.

## Generation and retained content

The generator accepts an optional `essayTypeId` that must be available for the
selected grade. Automatic generation selects from the available references. An
empty list blocks new generation with a clear error. The demo lists available types
for the selected grade. Common, grade, type, type-specific grade and difficulty
instructions are composed with the explicit word-count requirement.

Questions retain `essayTypeId` and an immutable type snapshot. Multi-frame questions
also retain `storyFrames`, the ordered event descriptions used to generate the
single framed image. Marking checks the student's story against this sequence and
allows creative details. Supplied openings and incoming emails do not contribute
to the student's word count. Original image generation prompts are excluded from
marking. The planned sequence also provides accessible text if an already-generated
image cannot load.

Required image generation failures fail the task: they never save or assign a
text-only replacement. Optional image failures retain the existing fallback. The
assessment demo generates an ephemeral preview image; publication generates durable
assets through the existing image service. AI calls are mocked in tests.

Practice reuse checks current type availability and the photo setting for that
specific type and grade. Assignment/completion snapshots and existing question IDs
remain unchanged. Durable next-practice drafts and frozen assessment items preserve
the type and frame sequence.

## Lifetime essay-type variation

Student selection chooses a type before searching the question bank. It obtains
available type IDs from the current grade configuration, excludes types used at
any point in the student's history, and randomly selects an unused available type.
Once all available types have been used, it randomly selects from all available
types. History spans every topic, syllabus, grade and language. It does not reset
after all types have been exhausted.

The rule applies to initial/pre-assessment essay assignments, subsequent practices,
and each essay item in a subject assessment. Admin previews do not consume student
history. A multi-essay paper consumes types within its local preparation sequence,
then commits the history when the paper is published. A retry retains its chosen
content when it is still eligible.

`studentEssayPractices/{studentId}/typeHistory/{essayTypeId}` stores first assignment
and survives topic resets. Practice and assessment assignment transactions share
this history and the `questionUsage` registry. If another flow consumes the chosen
unused type first, the stale assignment fails and is reselected. Once types are
exhausted, random selection may repeat a type immediately, but the same question ID
cannot be assigned again. Usage records retain `essayTypeId` and `seedUsed`, so repeat
checks do not depend on the reusable question pool. Existing theme exclusion and
fallback-theme behavior continue to apply.

Initial browser assignments use the authenticated `prepareStudentEssayQuestion`
action on the existing `generateLlmImage` endpoint. The server checks ownership,
linked-guardian or site-administrator access before selecting/generating content.
The standalone generator remains student-independent and receives the chosen
`essayTypeId` from the assignment flow.

## Clearing an existing reusable pool

`scripts/clear-essay-question-pool.cjs` previews the exact question/index deletions,
history metadata updates, and immutable snapshots required by existing assignments
and shared pre-assessment templates. Its production command is bound to
`readyherox`. The clear leaves configuration, student assignments, submissions,
results and referenced image assets intact.

```sh
node scripts/clear-essay-question-pool.cjs --report /workspace/essay-pool-clear/preview.json
node scripts/clear-essay-question-pool.cjs --report /workspace/essay-pool-clear/applied.json --apply
```

The apply command briefly enables `essayConfig/poolMaintenance`, which blocks pool
and essay-assignment writes. It then reads a fresh plan and atomically freezes
referenced content in the read-only `essayQuestionSnapshots` collection, backfills
type/seed history, and deletes reusable question documents and index entries.
ID-only records in `essayQuestionRetirements` prevent saved generation drafts and
older clients from recreating a removed question. Queued selections are discarded
when their IDs are retired; unsaved drafts with new IDs can still resume normally.
Document update-time preconditions reject concurrent changes without a partial
clear. Maintenance ownership is checked on acquisition/release. The command verifies
that the pool is empty and releases maintenance in a `finally` block.

Snapshots support historical/assigned question lookups only: pool listing and reuse
never include them. Unreferenced questions receive no snapshot. Deploy the updated
readers and rules before clearing. The `essay-functions` deployment group also
updates MCQ/fill-in-the-blanks readiness readers and the topic-reset endpoint, which
can resolve past essays while rebuilding student progress.

Local verification adds:

```sh
node public/features/essay_config/essay_type_selection.test.mjs
node scripts/clear-essay-question-pool.test.cjs
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node --test functions/essay_type_variation_emulator.test.js functions/essay_pool_clear_emulator.test.js
```

## Compatibility and rollout

Until `essayConfig/settings` exists, configuration reads derive a read-only catalog
and grade settings from `essayQuestionGenerator/config`. Only normal essay is
initially assigned to grades, retaining the previous photo choices, minimum words,
helping suggestions and instructions. The other four types start unassigned.

The first explicit save through Essay Admin persists the new collections atomically.
The legacy document remains intact. Existing generator configuration API names
continue to work; once the new configuration exists, legacy saves update its shared
settings while preserving type definitions and grade assignments. Questions without
type metadata continue to read as legacy normal essays for availability checks.

Deploy the `essayConfig` callable and Firestore rules before publishing the updated
Hosting assets. Deploy affected backend generation/assignment functions together
with the new shared code, including `generateLlmImage`,
`onStudentEssayPracticeCompleted`, and `onSyllabusSubscriptionCreated`, plus the
subject assessment generation functions. No production deployment or configuration
write is performed by development or tests. Review and save the grade/type choices
in Essay Admin after deployment to enable additional types.

The scoped deployment commands, in order, are:

```sh
bash scripts/deploy-firebase.sh essay-functions
bash scripts/deploy-firebase.sh firestore-rules
bash scripts/deploy-firebase.sh hosting
```

## Production deployment — 12 November 2026

Deployed to Firebase project `readyherox`: the new `essayConfig` callable,
`generateLlmImage`, `onStudentEssayPracticeCompleted`,
`onSyllabusSubscriptionCreated`, `subjectAssessment`,
`onSubjectAssessmentSubmitted`, `onStudentSubjectAssessmentRequested`, and
`onSubjectAssessmentSubscriptionCreated`, followed by Firestore rules and Hosting.
All eight function operations and both subsequent releases completed successfully.

Post-deployment checks confirmed that nine published configuration, admin,
generation and scoring assets match their local SHA-256 hashes. The
`essayConfig`, `generateLlmImage` and `subjectAssessment` endpoints are reachable
and return HTTP 401 for unauthenticated requests. These checks make no paid AI
requests and do not write production configuration or student records. Existing
grade choices remain intact; assign the additional types and save in Essay Admin
to enable them.

The subsequent lifetime-variation release deployed all eleven functions in the
`essay-functions` group, Firestore rules and Hosting. Post-deployment checks
confirmed that fifteen published assets match the local files and all three HTTP
endpoints still reject unauthenticated requests. Emulator integration, assignment,
assessment, rules and browser checks passed with mocked AI providers.

The production pool clear completed successfully: five question documents and
their index entries were removed, with five frozen snapshots for existing
references and five ID-only retirement markers. Eight student metadata records
were updated and one durable type-history entry was created. The reusable pool
was verified empty and maintenance was released. Existing student work,
configuration and shared templates remain available. The operation report is
`/workspace/essay-pool-clear/applied.json`.

## Verification

```sh
node public/features/essay_config/essay_config.test.mjs
node public/features/essay_question_generator/essay_question_generator_feature.test.mjs
node public/features/essay_question_generator/essay_support.test.mjs
node public/features/essay_question_generator/pages/admin/essay_question_generator_admin.test.mjs
node public/features/essay_question_generator/pages/admin/essay_question_demo.test.mjs
node public/features/student_essay_practice_generator/student_essay_practice_generator.test.mjs
node public/features/essay_scoring/essay_scoring_feature.test.mjs
```

With a local Firestore emulator on port 8987:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node --test functions/features/essay_config/essay_config_emulator.test.js
FIRESTORE_EMULATOR_HOST=127.0.0.1:8987 node scripts/test-essay-config-browser.cjs
python scripts/test-essay-support-rules.py
```

The tests use isolated `demo-` projects and reject nonlocal emulator addresses.
The browser check covers real UI/API/database persistence, load/save retries,
adding a type with a generated ID, grade-specific photo choices and instructions,
locked required images, generation/save, and desktop/mobile layout.
