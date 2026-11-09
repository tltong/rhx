import {createTutorReviewForQuestion} from "./tutor_module.js?v=20261109-shared-tutor-v1";
import {getSubjectAssessmentTutorQuestion} from "../subject_assessment/subject_assessment_module.js?v=20261109-assessment-tutor-v1";

export function createSubjectAssessmentTutor({assessmentId, position}, {
  getQuestion = getSubjectAssessmentTutorQuestion, createReview = createTutorReviewForQuestion,
} = {}) {
  return createReview(async questionId => {
    const question = await getQuestion({assessmentId, position});
    if (question.id !== questionId) throw new Error("The tutor question does not match this assessment item.");
    if (question.tutorEnabled !== true) throw Object.assign(new Error("Tutor is disabled for this topic."), {code: "tutor-disabled"});
    return question;
  });
}
