import {
  assignTopicPreAssessmentPractice,
  getSyllabusById,
  getTopicPreAssessmentPractice,
  listSyllabuses
} from "../syllabus/syllabus_module.js?v=20260731-practice-replacement";
import {
  getAssessmentFrameworkById
} from "../assessment_framework/assessment_framework_module.js?v=20260731-practice-replacement";
import {
  getDiagramConfigForSyllabus
} from "../diagram_config/diagram_config_module.js?v=20260731-practice-replacement";
import {
  getDefaultLlmPromptConfig
} from "../llm_prompt_config/llm_prompt_config_module.js?v=20260731-practice-replacement";
import {
  generatePlannedQuestions
} from "../question_generator/question_generator_module.js?v=20260801-syllabus-topic-instructions";
import {
  createPractice,
  deletePractice,
  getPracticeById,
  practiceTypes
} from "../practice/practice_module.js?v=20260731-practice-replacement";
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
  generatePreAssessmentPractice,
  loadPreAssessmentGeneratorOptions,
  loadPreAssessmentPractice
};
