/**
 * External API
 *
 * generateAssessmentPractice({
 *   studentId: string,
 *   syllabusId: string,
 *   topicId: string
 * }): Promise<{
 *   studentId: string,
 *   syllabusId: string,
 *   topicId: string,
 *   levelId: string,
 *   assessmentFrameworkId: string,
 *   language: string,
 *   difficultyLevel: string,
 *   levelCriteria: Object,
 *   allocation: Object,
 *   practice: Practice,
 *   assignment: StudentPracticeAssignment,
 *   questionSets: {
 *     withoutDiagram: QuestionGenerationSet,
 *     withDiagram: QuestionGenerationSet
 *   },
 *   prompts: string[],
 *   questions: Question[]
 * }>
 */
const {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  getAssessmentLevelCriteria,
} = require("../assessment_framework/assessment_framework_module");
const {
  getTopicDiagramPercentage,
} = require("../diagram_config/diagram_config_module");
const {
  getDefaultLlmPromptConfig,
} = require("../llm_prompt_config/llm_prompt_config_module");
const {
  createPractice,
  deletePractice,
  getPracticeById,
  practiceTypes,
} = require("../practice/practice_module");
const {
  getQuestionsForPractice,
  listQuestionsByTopic,
} = require("../question/question_module");
const {
  generateQuestions,
  generateQuestionsWithDiagram,
} = require("../question_generator/question_generator_module");
const {
  getStudentTopicLevel,
} = require(
  "../student_assessment_progress/student_assessment_progress_module"
);
const {
  assignPracticeToStudent,
  listAssignedPracticeIds,
  listCompletedPracticeIds,
} = require("../student_practice/student_practice_module");
const {
  getStudentSyllabusSubscriptionLanguage,
} = require("../syllabus_subscription/syllabus_subscription_module");
const {
  getSyllabusAssessmentFrameworkId,
} = require("../syllabus/syllabus_module");
const {
  GenerateAssessmentPractice,
} = require("./application/generate_assessment_practice");
const {
  allocateAssessmentQuestions,
} = require("./domain/assessment_question_allocation");

const generateAssessmentPracticeUseCase = new GenerateAssessmentPractice({
  getStudentTopicLevel,
  getSyllabusAssessmentFrameworkId,
  getAssessmentLevelCriteria,
  getStudentSyllabusSubscriptionLanguage,
  getTopicDiagramPercentage,
  getDefaultLlmPromptConfig,
  allocateAssessmentQuestions,
  listQuestionsByTopic,
  getQuestionsForPractice,
  listAssignedPracticeIds,
  listCompletedPracticeIds,
  getPracticeById,
  generateQuestions,
  generateQuestionsWithDiagram,
  createPractice,
  deletePractice,
  assignPracticeToStudent,
  assessmentPracticeType: practiceTypes.ASSESSMENT,
  assessmentFrameworkEndLevelId: ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
});

async function generateAssessmentPractice(input) {
  return generateAssessmentPracticeUseCase.execute(input);
}

module.exports = {
  generateAssessmentPractice,
};
