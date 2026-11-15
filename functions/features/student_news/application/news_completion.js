const {fail} = require("../../news_article/domain/news_article");
const {attemptId} = require("../../news_article/domain/news_questions");

function createNewsCompletion({repository, rewards, now}) {
  async function stage(tx, {assignmentRef, attempt, uid, fallbackSettings}) {
    const assignment = (await tx.get(assignmentRef)).data();
    if (!assignment || assignment.studentId !== uid || assignment.storyId !== attempt.storyId || assignment.gradeKey !== attempt.gradeKey
        || !["ready", "completed"].includes(assignment.status)) throw fail("Open the complete article before finishing it.", "failed-precondition");
    if (attempt.status !== "submitted") throw fail("Submit all three questions before finishing the article.", "failed-precondition");
    const historyRef = repository.db().doc(`studentNews/${uid}/history/${assignment.storyId}`), previous = (await tx.get(historyRef)).data();
    const rewardSettings = assignment.rewardSettings || fallbackSettings;
    const earned = await rewards.stageCompletion(tx, {studentId: uid, storyId: assignment.storyId, assignmentId: assignment.assignmentId, score: attempt.score, rewardSettings});
    const completedAt = assignment.completedAt || previous?.completedAt || now();
    tx.update(assignmentRef, {status: "completed", completedAt, rewardSettings, rewards: earned, score: attempt.score});
    tx.set(historyRef, {storyId: assignment.storyId, completedAt, assignmentId: previous?.assignmentId || assignment.assignmentId,
      firstAssignedAt: previous?.firstAssignedAt || assignment.openedAt || assignment.createdAt, lastAssignedAt: assignment.openedAt || assignment.createdAt, rewards: earned});
    return {assignmentId: assignment.assignmentId, completedAt: completedAt?.toDate?.() || completedAt, rewards: earned};
  }
  async function finish(uid, assignmentId) {
    const assignmentRef = repository.db().doc(`studentNews/${uid}/daily/${assignmentId}`), fallbackSettings = await rewards.settings();
    return repository.db().runTransaction(async tx => {
      const assignment = (await tx.get(assignmentRef)).data();
      if (!assignment?.storyId) throw fail("Open the complete article before finishing it.", "failed-precondition");
      const attempt = (await tx.get(repository.db().doc(`studentNews/${uid}/questionAttempts/${attemptId(assignment)}`))).data();
      if (attempt?.status !== "submitted") throw fail("Submit all three questions before finishing the article.", "failed-precondition");
      return stage(tx, {assignmentRef, attempt, uid, fallbackSettings});
    });
  }
  return {stage, finish};
}
module.exports = {createNewsCompletion};
