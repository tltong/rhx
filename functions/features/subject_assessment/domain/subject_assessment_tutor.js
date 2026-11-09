const {id, problem, sourceKey} = require("./subject_assessment");
function tutorInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["assessmentId", "position"].includes(key))) throw problem("Provide the assessment and item position only.");
  if (!Number.isSafeInteger(input.position) || input.position < 1) throw problem("Item position must be a positive whole number.");
  return {assessmentId: id(input.assessmentId, "Assessment ID"), position: input.position};
}
const eligibleTutorItem = (item, marked) => item?.questionType === "normal" && marked?.questionType === "normal" && marked.answer?.isCorrect === false;
const tutorQuestionId = async (assessmentId, position) => "assessment-" + await sourceKey(JSON.stringify([id(assessmentId), position]));
async function tutorQuestion(assessment, item, marked, enabled) {
  if (!eligibleTutorItem(item, marked)) throw problem("Tutor review is available only for incorrect or unanswered MCQs.", "failed-precondition");
  const content = item.contentSnapshot;
  if (!["a", "b", "c", "d"].includes(marked.answer.correctAnswer)) throw problem("The marked answer could not be loaded.", "failed-precondition");
  return {id: await tutorQuestionId(assessment.assessmentId, item.position), syllabusId: assessment.syllabusId, topicId: item.topicId,
    questionText: content.questionText, options: content.options, correctAnswer: marked.answer.correctAnswer,
    explanation: marked.answer.explanation || "", language: assessment.language, difficulty: item.difficulty,
    specialInstruction: content.specialInstruction || "", hasDiagram: !!content.hasDiagram, svg: content.svg || "", tutorEnabled: enabled === true};
}
module.exports = {tutorInput, eligibleTutorItem, tutorQuestionId, tutorQuestion};
