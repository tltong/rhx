# Essay pictures and helping suggestions

The existing Essay Question Generator admin page configures `gradeSupport` for
primary/secondary standards 1–6. Each entry has `pictureEnabled` (default false),
`helpingWordsEnabled` (default false), and `helpingWordCount` (default 5; 1–30).
Settings apply to all languages for that level/standard. Suggestions use the essay
language; each word or short phrase counts as one entry and is optional to use.
The suggestion request uses the written question and its image-generation prompt
as text context. The question takes priority; when no image prompt is available,
suggestions use the question alone. This needs no image-reading call, and an image
generation failure does not prevent using the available image prompt for suggestions.

`generateEssayQuestion` saves an immutable `support` snapshot with the question:
settings, optional picture metadata, suggestions, and separate ready/failed/disabled
outcomes. Legacy questions have no snapshot and remain readable without migration.
Written questions are complete without their optional content. An optional
generation failure omits the relevant element and retains the valid task.

When pictures are enabled, one text-generation request returns `questionText` and
an `imagePrompt` derived from that question. The prompt is saved on the question,
including preview/save and durable next-practice drafts. A missing or malformed
optional prompt skips image generation and preserves the written question.

The existing Image Generation feature generates the image once from `imagePrompt`,
using its current model/quality settings. No vision inspection, scene-description,
or extra text request is made to analyse the generated pixels. The image is saved
under `essay-question-images/{questionId}.png` in the project's default Storage
bucket. Backend code owns these objects; a Firebase download-token URL is shared
with the educational question. Pictures contain no student-specific data.

Server-only `essayQuestionAssets` documents reserve image attempts, retain the image
prompt, and cache their outcomes. Repeating an image request with the same question ID/content returns the
saved picture or its failed outcome; it does not make another paid generation call.
A crash during a paid request can leave the image attempt unavailable; the text-only
fallback is intentional. A failed write can leave an unreferenced image; automatic
image deletion is deliberately excluded because assigned questions must retain assets.

`prepareEssayQuestionForAssignment(questionId)` is available in both feature layers.
It returns compatible saved content or prepares a new immutable question for an
initial assignment whose shared source predates the current settings. Replacements
retain `sourceEssayQuestionId` on assignments and completions, preserving retries
and the original syllabus attachment. Existing assigned/completed attempts retain
exactly the same question. Subsequent practice generation retains its existing
history/theme exclusions and filters reusable questions against current support
settings. A recorded optional generation failure is an eligible fallback; a legacy
question created with those options off does not satisfy enabled settings.

The admin demo also shows read-only image-specific LLM instructions and the returned
image-generation prompt. The instruction text is shared with the generator; the
preview explains missing prompts or disabled pictures without another AI call.

The student practice page and admin preview share one renderer. Pictures can be
opened larger. New images use the written task as accessibility/fallback context;
existing questions with saved image descriptions remain readable without migration.
The practice timer begins once the picture loads or the text fallback is shown.
Grading uses the written question as its reference and permits creative details.
Image prompts and old scene descriptions are excluded from grading, so students are
not required to mention particular visual objects or actions. Unused helping
suggestions do not attract a deduction. Results remain separate for each student.

No new external HTTP function is introduced. The authenticated `generateLlmImage`
endpoint adds `createEssayPicture` (verified admin only) and `prepareEssayQuestion`
(signed-in, derives all generation criteria from an existing shared question).
Backend callers use feature APIs directly. Existing OpenAI/DeepSeek credentials
stay server-side. Both assignment and essay-completion triggers need those provider
bindings because either can prepare new configured content. The subscription
trigger's existing event retry policy is preserved.

Deploy together, when requested: Hosting, Firestore rules, `generateLlmImage`,
`onStudentEssayPracticeCompleted`, and `onSyllabusSubscriptionCreated`. There is no
schema backfill and no feature is enabled by deployment alone. The Storage bucket
must exist and the Functions runtime identity must be able to create objects there.

Tests use mocked providers; they do not spend generation credits:

```
node public/features/essay_question_generator/essay_support.test.mjs
node public/features/essay_question_generator/essay_question_generator_feature.test.mjs
node public/features/essay_question_generator/pages/admin/essay_question_generator_admin.test.mjs
node public/features/essay_question_generator/components/essay_question_support_view.browser.test.mjs
```

With a local Firestore emulator on port 8987:

```
python scripts/test-essay-support-rules.py
```
