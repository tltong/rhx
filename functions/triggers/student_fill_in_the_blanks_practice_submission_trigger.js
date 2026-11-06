const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {withTopicResetGuard} = require("../utils/student_topic_reset_guard");
const {deepseekApiKey} = require("../deepseek");
const {openaiApiKey} = require("../utils/llm/openai_util");

async function processFillInTheBlanksSubmission(event, {
  sessions = require("../features/fill_in_the_blanks_practice_session/fill_in_the_blanks_practice_session_module"),
  followup = require("./student_fill_in_the_blanks_practice_completion_trigger").processCompletedFillInTheBlanksPractice,
  guard = withTopicResetGuard,
  rejectSubmission = async (scope, requestId, code) => {
    const db = require("../utils/firebase/firebase_ops").getFirestoreDb();
    const ref = db.collection("studentFillInTheBlanksPractices").doc(scope.studentId).collection("submissions").doc(scope.practiceId);
    await db.runTransaction(async tx => {
      const saved = await tx.get(ref);
      if (saved.exists && saved.data().requestId === requestId && saved.data().markingStatus !== "completed") {
        tx.update(ref, {markingStatus: "failed", errorCode: code, leaseToken: null, leaseUntil: null});
      }
    });
  },
} = {}) {
  const before = event.data?.before?.data(), after = event.data?.after;
  if (!after?.exists) return null;
  const submission = after.data();
  // Backend status/lease updates never start another marking attempt.
  if (!submission.requestId || before?.requestId === submission.requestId) return null;
  const scope = {studentId: event.params.studentId, practiceId: event.params.practiceId};
  try {
    const source = await sessions.loadFillInTheBlanksPracticeSession(scope);
    return await guard({studentId: scope.studentId, createdAt: after.createTime,
      scopes: [{syllabusId: source.practice.syllabusId, topicId: source.practice.topicId}]}, async () => {
      const loaded = await sessions.submitFillInTheBlanksPracticeSession({...scope, answers: submission.answers,
        timeTakenSeconds: submission.timeTakenSeconds});
      // New completions have their own trigger. Explicit requests on a completed
      // submission repair failed follow-up work without submitting answers again.
      if (before?.markingStatus === "completed") await followup(scope);
      return loaded;
    });
  } catch (error) {
    if (error.code === "topic-practice-reset") return null;
    if (["invalid-argument", "not-found", "failed-precondition"].includes(error.code)) {
      await rejectSubmission(scope, submission.requestId, error.code);
      return null;
    }
    throw error;
  }
}
const onStudentFillInTheBlanksPracticeSubmitted = onDocumentWritten({
  document: "studentFillInTheBlanksPractices/{studentId}/submissions/{practiceId}",
  region: "us-central1", memory: "1GiB", timeoutSeconds: 540, minInstances: 0,
  secrets: [deepseekApiKey, openaiApiKey], retry: true,
}, processFillInTheBlanksSubmission);
module.exports = {processFillInTheBlanksSubmission, onStudentFillInTheBlanksPracticeSubmitted};
