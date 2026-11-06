import * as students from "../student_fill_in_the_blanks_practice/student_fill_in_the_blanks_practice_module.js?v=20261105-chinese-count-v1";
import {getFillInTheBlanksPracticeById} from "../fill_in_the_blanks_practice/fill_in_the_blanks_practice_module.js?v=20261105-chinese-count-v1";
import {getFillInTheBlanksQuestionById} from "../fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module.js?v=20261105-chinese-count-v1";
import {getFillInTheBlanksResult} from "../fill_in_the_blanks_scoring/fill_in_the_blanks_scoring_module.js?v=20261104-fill-preassessment-v3";
import {withAccess} from "../../utils/fill_in_the_blanks/access.js?v=20261104-fill-preassessment-v3";
import {getStudentPracticeAssessment} from "../student_assessment_progress/student_assessment_progress_module.js?v=20261104-fill-preassessment-v3";
import {id, problem} from "../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks.js?v=20261105-chinese-count-v1";

export const loadFillInTheBlanksPracticeSession = input => withAccess(async () => {
  const scope = {studentId: id(input.studentId), practiceId: id(input.practiceId)};
  let completed = await students.getCompletedFillInTheBlanksPractice(scope);
  const assignment = completed ?? await students.getAssignedFillInTheBlanksPractice(scope)
    ?? (completed = await students.getCompletedFillInTheBlanksPractice(scope));
  if (!assignment) throw problem("This practice is not assigned to the student.", "not-found");
  const practice = await getFillInTheBlanksPracticeById(scope.practiceId);
  if (!practice || practice.passageId !== assignment.passageId) throw problem("The practice definition is missing or inconsistent.", "failed-precondition");
  const [passage, result, submission, processing] = await Promise.all([
    getFillInTheBlanksQuestionById(practice.passageId), getFillInTheBlanksResult(scope), students.getFillInTheBlanksSubmission(scope),
    completed ? students.getFillInTheBlanksCompletionProcessing(scope) : null,
  ]);
  if (!passage) throw problem("The passage could not be loaded.", "not-found");
  const assessment = completed && practice.type === "pre assessment" ? await getStudentPracticeAssessment(scope) : null;
  return {status: completed ? "completed" : "assigned", assignment, practice, passage, result, submission, processing, assessment};
});
export const submitFillInTheBlanksPracticeSession = input => withAccess(async () => {
  const loaded = await loadFillInTheBlanksPracticeSession(input);
  if (loaded.status === "completed") return loaded;
  await students.submitFillInTheBlanksAnswers(input, loaded.passage.questions, loaded.passage.language);
  // The backend trigger grades the immutable submission; the page observes its result.
  return loadFillInTheBlanksPracticeSession(input);
});
