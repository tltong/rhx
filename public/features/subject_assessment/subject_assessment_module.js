/** Assessment writes and scores are exclusively owned by the authenticated backend. */
import {getFirebaseApp} from "../../utils/firebase/firebase_ops.js";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
async function defaultRequest(action, input) {
  const user = requireCurrentFirebaseAuthUser();
  const response = await getFirebaseApp().functions("us-central1").httpsCallable("subjectAssessment", {timeout: 120000})({action, input});
  if (requireCurrentFirebaseAuthUser().uid !== user.uid) throw new Error("The signed-in account changed. Reload this page.");
  return response.data;
}
function createSubjectAssessmentFeature({request = defaultRequest} = {}) {
  return {
    getStudentSubjectAssessmentOverview: () => request("overview", {}),
    startStudentSubjectAssessment: input => request("start", input),
    getSubjectAssessment: input => request("get", typeof input === "string" ? {assessmentId: input} : input),
    listStudentSubjectAssessments: (input = {}) => request("list", input),
    getSubjectAssessmentSession: input => request("session", input),
    getSubjectAssessmentTutorQuestion: input => request("tutor", input),
    saveSubjectAssessmentAnswers: input => request("save", input),
    submitSubjectAssessment: input => request("submit", input),
    retrySubjectAssessmentMarking: input => request("retry", input),
    getSubjectAssessmentResult: input => request("result", input),
    listStudentSubjectAssessmentResults: (input = {}) => request("results", input),
  };
}
export {createSubjectAssessmentFeature};
export const {getStudentSubjectAssessmentOverview, startStudentSubjectAssessment, getSubjectAssessment, listStudentSubjectAssessments, getSubjectAssessmentSession, getSubjectAssessmentTutorQuestion, saveSubjectAssessmentAnswers,
  submitSubjectAssessment, retrySubjectAssessmentMarking, getSubjectAssessmentResult, listStudentSubjectAssessmentResults} = createSubjectAssessmentFeature();
