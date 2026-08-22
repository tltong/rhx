/**
 * External API contracts
 *
 * generateAssessmentPractice({
 *   studentId: string,
 *   syllabusId: string,
 *   topicId: string
 * })
 *   Output: Promise<{
 *     studentId: string,
 *     syllabusId: string,
 *     topicId: string,
 *     levelId: string,
 *     assessmentFrameworkId: string,
 *     language: string,
 *     difficultyLevel: string,
 *     levelCriteria: Object,
 *     allocation: {
 *       totalQuestions: number,
 *       diagramPercentage: number,
 *       withDiagram: number,
 *       withoutDiagram: number
 *     },
 *     questionSets: {
 *       withoutDiagram: QuestionGenerationSet,
 *       withDiagram: QuestionGenerationSet
 *     },
 *     practice: Practice,
 *     assignment: StudentPracticeAssignment,
 *     prompts: string[],
 *     questions: Question[]
 *   }>. Reuses eligible stored questions, generates and stores only the
 *   shortage, then creates and assigns the assessment practice.
 *
 * QuestionGenerationSet output:
 * {
 *   hasDiagram: boolean,
 *   numberOfQuestions: number,
 *   reusedQuestionCount: number,
 *   generatedQuestionCount: number,
 *   prompts: string[],
 *   questions: Question[]
 * }
 *
 * generatePreAssessmentPractice({
 *   syllabusId: string,
 *   topicId: string,
 *   language: string
 * })
 *   Input: the syllabus topic and language for which to generate or replace a
 *   pre-assessment practice.
 *   Output: Promise<{
 *     practice: Practice,
 *     assignment: {language: string, practiceId: string},
 *     replacement: {
 *       replaced: boolean,
 *       previousPracticeId: string|null,
 *       deletedQuestionCount: number
 *     },
 *     syllabusId: string,
 *     topicId: string,
 *     topicName: string,
 *     language: string,
 *     allocation: {
 *       totalQuestions: number,
 *       diagramPercentage: number,
 *       withDiagram: number,
 *       withoutDiagram: number,
 *       byDifficulty: Object<string, {
 *         difficultyLevel: string,
 *         total: number,
 *         withDiagram: number,
 *         withoutDiagram: number
 *       }>
 *     },
 *     categoryResults: Array<{
 *       difficultyLevel: string,
 *       hasDiagram: boolean,
 *       numberOfQuestions: number
 *     }>,
 *     batches: Object[],
 *     prompts: string[],
 *     questions: PreAssessmentQuestion[]
 *   }>.
 *
 * loadPreAssessmentGeneratorOptions()
 *   Input: none.
 *   Output: Promise<{
 *     syllabuses: Array<{
 *       id: string,
 *       country: string,
 *       level: string,
 *       year: number,
 *       subject: string,
 *       active: boolean,
 *       languages: string[],
 *       topics: Array<{
 *         id: string,
 *         topicName: string,
 *         preAssessmentPractices: Object<string, {
 *           language: string,
 *           practiceId: string
 *         }>
 *       }>
 *     }>
 *   }>.
 *
 * loadPreAssessmentPractice({
 *   syllabusId: string,
 *   topicId: string,
 *   language: string
 * })
 *   Input: the syllabus topic and language whose assigned practice should be
 *   loaded.
 *   Output: Promise<null|{
 *     assignment: {language: string, practiceId: string},
 *     practice: Practice,
 *     questions: PreAssessmentQuestion[]
 *   }>. Returns null when no practice is assigned.
 *
 * Practice output:
 * {
 *   id: string,
 *   type: "pre assessment",
 *   questions: Array<{
 *     syllabusId: string,
 *     topicId: string,
 *     questionId: string
 *   }>,
 *   dateGenerated: Date
 * }
 *
 * PreAssessmentQuestion output:
 * {
 *   id: string,
 *   syllabusId: string,
 *   topicId: string,
 *   questionText: string,
 *   options: {a: string, b: string, c: string, d: string},
 *   correctAnswer: "a"|"b"|"c"|"d",
 *   group: "pre assessment",
 *   explanation: string,
 *   hasDiagram: boolean,
 *   svg: string,
 *   difficulty: string,
 *   language: string,
 *   specialInstruction: string
 * }
 */
import {
  assignTopicPreAssessmentPractice,
  getSyllabusAssessmentFrameworkId,
  getSyllabusById,
  getTopicPreAssessmentPractice,
  listSyllabuses
} from "../syllabus/syllabus_module.js?v=20260815-assessment-practice";
import {
  ASSESSMENT_FRAMEWORK_END_LEVEL_ID,
  getAssessmentLevelCriteria,
  getAssessmentFrameworkById
} from "../assessment_framework/assessment_framework_module.js?v=20260815-assessment-practice";
import {
  getDiagramConfigForSyllabus,
  getTopicDiagramPercentage
} from "../diagram_config/diagram_config_module.js?v=20260815-assessment-practice";
import {
  getDefaultLlmPromptConfig
} from "../llm_prompt_config/llm_prompt_config_module.js?v=20260731-practice-replacement";
import {
  generatePlannedQuestions,
  generateQuestions,
  generateQuestionsWithDiagram
} from "../question_generator/question_generator_module.js?v=20260801-syllabus-topic-instructions";
import {
  createPractice,
  deletePractice,
  getPracticeById,
  practiceTypes
} from "../practice/practice_module.js?v=20260816-practice-question-ids";
import {
  getQuestionsForPractice,
  listQuestionsByTopic
} from "../question/question_module.js?v=20260822-assessment-reuse";
import {
  assignPracticeToStudent,
  listAssignedPracticeIds,
  listCompletedPracticeIds
} from "../student_practice/student_practice_module.js?v=20260822-assessment-reuse";
import {
  deletePreAssessmentQuestion,
  getPreAssessmentQuestion
} from "../pre_assessment_question/pre_assessment_question_module.js?v=20260731-existing-practice-preview";
import {
  GeneratePreAssessmentPractice
} from "./application/generate_pre_assessment_practice.js?v=20260731-planned-question-batches";
import {
  GeneratePreAssessmentQuestions
} from "./application/generate_pre_assessment_questions.js?v=20260731-planned-question-batches";
import {
  LoadPreAssessmentContext
} from "./application/load_pre_assessment_context.js?v=20260731-practice-replacement";
import {
  LoadPreAssessmentGeneratorOptions
} from "./application/load_pre_assessment_generator_options.js?v=20260731-existing-practice-preview";
import {
  LoadPreAssessmentPractice
} from "./application/load_pre_assessment_practice.js?v=20260731-existing-practice-preview";
import {
  allocatePreAssessmentQuestions
} from "./domain/pre_assessment_allocation.js?v=20260731-practice-replacement";
import {
  getStudentSyllabusSubscriptionLanguage
} from "../syllabus_subscription/syllabus_subscription_module.js?v=20260815-language-lookup";
import {
  getStudentTopicLevel
} from "../student_assessment_progress/student_assessment_progress_module.js?v=20260815-assessment-practice";
import {
  GenerateAssessmentPractice
} from "./application/generate_assessment_practice.js?v=20260822-assessment-reuse";
import {
  allocateAssessmentQuestions
} from "./domain/assessment_question_allocation.js?v=20260815-assessment-practice";

/**
 * @typedef {Object} GeneratePreAssessmentPracticeInput
 * @property {string} syllabusId
 * @property {string} topicId
 * @property {string} language
 */

const loadPreAssessmentContextUseCase = new LoadPreAssessmentContext({
  getSyllabusById,
  getAssessmentFrameworkById,
  getDiagramConfigForSyllabus,
  getDefaultLlmPromptConfig,
  getTopicPreAssessmentPractice
});
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
  assessmentFrameworkEndLevelId: ASSESSMENT_FRAMEWORK_END_LEVEL_ID
});
const generatePreAssessmentQuestionsUseCase =
  new GeneratePreAssessmentQuestions({
    allocatePreAssessmentQuestions,
    generatePlannedQuestions,
    preAssessmentGroup: practiceTypes.PRE_ASSESSMENT
  });
const generatePreAssessmentPracticeUseCase =
  new GeneratePreAssessmentPractice({
    loadPreAssessmentContext: (input) => (
      loadPreAssessmentContextUseCase.execute(input)
    ),
    generatePreAssessmentQuestions: (context) => (
      generatePreAssessmentQuestionsUseCase.execute(context)
    ),
    createPractice,
    deletePractice,
    deletePreAssessmentQuestion,
    getPracticeById,
    assignTopicPreAssessmentPractice,
    preAssessmentPracticeType: practiceTypes.PRE_ASSESSMENT
  });
const loadPreAssessmentGeneratorOptionsUseCase =
  new LoadPreAssessmentGeneratorOptions(listSyllabuses);
const loadPreAssessmentPracticeUseCase = new LoadPreAssessmentPractice({
  getTopicPreAssessmentPractice,
  getPracticeById,
  getPreAssessmentQuestion,
  preAssessmentPracticeType: practiceTypes.PRE_ASSESSMENT
});

/**
 * Generates and stores one pre-assessment practice for a syllabus topic and
 * language.
 *
 * @param {GeneratePreAssessmentPracticeInput} input
 */
async function generatePreAssessmentPractice(input) {
  return generatePreAssessmentPracticeUseCase.execute(input);
}

/**
 * Reuses or generates assessment questions, creates the practice, and assigns
 * it to the student.
 *
 * @param {{studentId: string, syllabusId: string, topicId: string}} input
 */
async function generateAssessmentPractice(input) {
  return generateAssessmentPracticeUseCase.execute(input);
}

async function loadPreAssessmentGeneratorOptions() {
  return loadPreAssessmentGeneratorOptionsUseCase.execute();
}

/**
 * Loads the practice and questions currently assigned to a topic-language pair.
 *
 * @param {GeneratePreAssessmentPracticeInput} input
 */
async function loadPreAssessmentPractice(input) {
  return loadPreAssessmentPracticeUseCase.execute(input);
}

export {
  generateAssessmentPractice,
  generatePreAssessmentPractice,
  loadPreAssessmentGeneratorOptions,
  loadPreAssessmentPractice
};
