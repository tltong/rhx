const {subjectStateReference} = require("../domain/student_subject_assessment");
const {problem} = require("../domain/subject_assessment");

async function guardAssessmentCleanup(db, transaction, studentId, syllabusId) {
  const state = await transaction.get(subjectStateReference(db, studentId, syllabusId));
  if (["pending", "running"].includes(state.data()?.cleanup?.status)) {
    throw problem("Subject assessment cleanup is still running. Try again shortly.", "failed-precondition");
  }
  return state;
}

module.exports = {guardAssessmentCleanup};
