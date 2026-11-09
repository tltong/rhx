# Topic tutor availability

In **Site Admin → Syllabus Admin**, choose a syllabus, find the topic, select or
clear **Enable tutor**, then press **Save Syllabus**. The selection applies to
all languages of that topic. Tutor currently supports MCQ reviews, including
MCQ pre-assessments; essay and fill-in-the-blanks have no tutor integration.

The setting is `syllabuses/{syllabusId}/topics/{topicId}.tutorEnabled`, a boolean.
New topics and existing topic documents without the field default to `true`.
Reads do not backfill documents. Saving a syllabus preserves explicit `false`;
unrelated topic/framework/practice updates preserve the setting.

The Syllabus feature exposes `isTopicTutorEnabled(syllabusId, topicId)` in both
web and backend modules. It reads current Firebase data and rejects missing
topics and invalid values. No new external HTTP function is introduced.

Practice Result reviews expose each question's current `tutorEnabled` value,
reading each distinct source topic once per result request. Incorrect MCQ
answers show **Review this question** only when enabled. A failed policy read
hides the optional tutor action while preserving the result and explanation.

Tutor feature APIs resolve the original question's actual syllabus/topic and
check the setting before returning a question, looking up/migrating a cached
set, generating mini questions, or checking an answer. Disabled topics reject
with code `tutor-disabled` and message **Tutor is disabled for this topic.**
Existing open sessions are checked again on the next answer/API call. Cached
questions remain stored and can be reused after re-enabling; no regeneration
is needed. Cached tutor reads now require the source question and its topic to
remain readable, even with an explicit count. Guidance selection now also reads
the current Tutor generation configuration to select its shared version.

These checks belong to the existing feature APIs. This change does not turn
the browser feature APIs into a new server authorization boundary for the
generic LLM/Firestore facilities.

## Shared guides across practice and subject assessments

Both flows use the existing Tutor cache. The routing question ID still identifies
the bank question or authorized frozen assessment item. It is separate from the
shared `guideId`, which has the form `shared-{contentHash}-{instructionHash}`.
Records remain at `tutor/{guideId}/counts/{count}/languages/{encodedLanguage}`;
their existing `questionId` field holds the internal guide ID. No collection,
stored field, index, rule or callable is added.

The content hash covers the complete model question input: text, ordered options,
correct answer/text, explanation, source language, difficulty, special instructions
and diagram/SVG. Equivalent missing optional fields and difficulty capitalization
are canonicalized. IDs, students, assessment attempts and topic metadata are not
model inputs and do not prevent reuse. Every source still checks its own topic
policy and access before looking at the shared cache.

The instruction hash covers the generation instructions and complete prompt
template. Requested language and mini-question count remain independent path
variants. Changes to question content or generation instructions select another
guide; changing feedback messages, saving unchanged configuration, or adjusting
the default count does not invalidate matching existing variants.

`generateTutorMiniQuestionSet` and `getTutorMiniQuestionSet` now both return an
existing matching guide or generate one on a miss. Shared guides are immutable:
create-only publication and a read of the winning document prevent concurrent
generations from replacing answers already shown to another student. Concurrent
misses can still both invoke the model, but all callers receive the same saved
guide. This change does not introduce a distributed generation queue or lease.

Responses preserve the caller's `questionId` for routing and add `guideId`. The
review page submits that ID for answer checks. Checks validate the current
authorized source's content version, then use the exact selected saved guide,
so an instruction edit cannot silently switch an open review's answers. If the
bank question changes, that open review must reload. Assessments retain their
frozen question and continue to use its original guide. A question edited during
initial page loading cannot display a guide for a different question version.

Existing unversioned guides remain untouched. They lack a verified content hash
and are not promoted into the shared cache. The first request for each shared
version generates a guide, and later eligible requests across students and
assessment/practice flows reuse it. Student answers, results and navigation
remain specific to their originating flow.

The change requires Hosting deployment. Backend Tutor feature modules mirror the
behavior for internal callers, but Tutor APIs remain unexported as Cloud Functions.
No assessment data migration or assessment regeneration is required.

Verification includes the Tutor feature/page suites, the shared-guide browser
flow, the real Firebase SDK bootstrap regression, and
`functions/tutor_shared_guide_emulator.test.js` with a local `demo-` project.

Released on 9 November 2026 at 12:38 UTC in Hosting version
`7c3ad8f7b2bde9aa`. All twelve updated public assets matched the deployed source.
Browser checks against the live pages with simulated data/storage/model responses
confirmed guide reuse across practice and assessment flows, topic gating,
count/language behavior and return navigation. The real Firebase SDK bootstrap
and sign-in guards passed with no uncaught JavaScript errors. Backend functions,
Firestore rules and the saved repeat policy were unchanged.
