const {onCall, HttpsError} = require("firebase-functions/v2/https");
const feature = require("./features/subject_assessment/subject_assessment_module");
function createSubjectAssessmentHandler({apis = feature} = {}) {
  const actions = {get: "getSubjectAssessment", list: "listStudentSubjectAssessments", session: "getSubjectAssessmentSession",
    save: "saveSubjectAssessmentAnswers", submit: "submitSubjectAssessment", retry: "retrySubjectAssessmentMarking",
    result: "getSubjectAssessmentResult", results: "listStudentSubjectAssessmentResults",
    overview: "getStudentSubjectAssessmentOverview", start: "startStudentSubjectAssessment", tutor: "getSubjectAssessmentTutorQuestion"};
  return async request => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to access subject assessments.");
    const action = request.data?.action;
    if (!Object.hasOwn(actions, action)) throw new HttpsError("invalid-argument", "Unknown assessment operation.");
    try {return await apis[actions[action]](request.data.input || {}, {auth: request.auth});}
    catch (error) {
      const safe = ["invalid-argument", "permission-denied", "unauthenticated", "not-found", "failed-precondition", "already-exists", "aborted", "unavailable"];
      if (safe.includes(error.code)) throw new HttpsError(error.code, error.message);
      throw new HttpsError("unavailable", "The assessment request could not finish. Check its status before retrying.");
    }
  };
}
module.exports = {createSubjectAssessmentHandler,
  subjectAssessment: onCall({region: "us-central1", memory: "512MiB", timeoutSeconds: 120}, createSubjectAssessmentHandler())};
