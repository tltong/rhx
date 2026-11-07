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
remain readable, even with an explicit count; tutor configuration is still
unnecessary for an existing explicit-count variant.

These checks belong to the existing feature APIs. This change does not turn
the browser feature APIs into a new server authorization boundary for the
generic LLM/Firestore facilities.
