/**
 * External API contracts
 *
 * generateQuestions(
 *   llmPromptConfigId: string,
 *   syllabusId: string,
 *   generationInput: {
 *     numberOfQuestions: number,
 *     difficultyLevel: string,
 *     language: string,
 *     group: "assessment"|"pre assessment",
 *     topicId: string,
 *     additionalInstructions?: string
 *   }
 * )
 *   Output: Promise<{
 *     prompts: string[],
 *     questions: GeneratedQuestion[]
 *   }>. Generates questions without diagrams in batches of up to five and
 *   stores them in the collection selected by group.
 *
 * generateQuestionsWithDiagram(
 *   llmPromptConfigId: string,
 *   syllabusId: string,
 *   generationInput: {
 *     numberOfQuestions: number,
 *     difficultyLevel: string,
 *     language: string,
 *     group: "assessment"|"pre assessment",
 *     topicId: string,
 *     additionalInstructions?: string
 *   }
 * )
 *   Output: Promise<{
 *     prompts: string[],
 *     questions: GeneratedQuestion[]
 *   }>. Generates and renders diagram questions in batches of up to five,
 *   then stores them in the collection selected by group.
 *
 * generatePlannedQuestions(
 *   llmPromptConfigId: string,
 *   syllabusId: string,
 *   generationInput: {
 *     categories: Array<{
 *       numberOfQuestions: number,
 *       difficultyLevel: string,
 *       hasDiagram: boolean
 *     }>,
 *     language: string,
 *     group: "assessment"|"pre assessment",
 *     topicId: string,
 *     additionalInstructions?: string
 *   }
 * )
 *   Output: Promise<{
 *     prompts: string[],
 *     questions: GeneratedQuestion[],
 *     batches: Array<{
 *       numberOfQuestions: number,
 *       categories: Array<{
 *         numberOfQuestions: number,
 *         difficultyLevel: string,
 *         hasDiagram: boolean
 *       }>
 *     }>
 *   }>. Generates a requested mix of difficulty and diagram categories,
 *   batching the plan into groups of up to five questions.
 *
 * loadQuestionGeneratorOptions()
 *   Input: none.
 *   Output: Promise<{
 *     promptConfigs: Array<{id: string, identifier: string}>,
 *     syllabuses: Array<{
 *       id: string,
 *       country: string,
 *       level: string,
 *       year: number,
 *       subject: string,
 *       languages: string[],
 *       topics: Array<{
 *         id: string,
 *         topicName: string,
 *         subtopics: Object<string, string>
 *       }>,
 *       active: boolean
 *     }>
 *   }>.
 *
 * GeneratedQuestion output:
 * {
 *   id: string,
 *   syllabusId: string,
 *   topicId: string,
 *   questionText: string,
 *   options: {a: string, b: string, c: string, d: string},
 *   correctAnswer: "a"|"b"|"c"|"d",
 *   group: "assessment"|"pre assessment",
 *   explanation: string,
 *   hasDiagram: boolean,
 *   svg: string,
 *   difficulty: string,
 *   language: string,
 *   specialInstruction: string
 * }
 *
 * Exported constant:
 *   practiceTypes: {ASSESSMENT: "assessment", PRE_ASSESSMENT: "pre assessment"}
 */
import {
  generateLlmPrompt,
  generateLlmPromptFromPlan,
  generateLlmPromptWithDiagram,
  loadLlmPromptGeneratorOptions
} from "../llm_prompt_generator/llm_prompt_generator_module.js?v=20260801-syllabus-topic-instructions";
import {
  getSyllabusById
} from "../syllabus/syllabus_module.js?v=20260722-question-generator";
import {
  practiceTypes,
  writeQuestions
} from "../question/question_module.js?v=20260822-assessment-reuse";
import {
  writePreAssessmentQuestions
} from "../pre_assessment_question/pre_assessment_question_module.js?v=20260731-question-writer-routing";
import {
  renderMermaidDiagram
} from "../diagram_generator/diagram_generator_module.js?v=20260724-thinking-disabled";
import {
  generateLlmText
} from "../../utils/llm/llm_ops.js?v=20260724-thinking-disabled";
import {
  DEEPSEEK_REQUEST_PROFILES
} from "../../utils/llm/deepseek_util.js?v=20260724-thinking-disabled";
import {
  GenerateQuestions
} from "./application/generate_questions.js?v=20260731-question-writer-routing";
import {
  GeneratePlannedQuestions
} from "./application/generate_planned_questions.js?v=20260731-planned-question-batches";
import {
  LoadQuestionGeneratorOptions
} from "./application/load_question_generator_options.js?v=20260722-question-generator";
import {
  WriteGeneratedQuestions
} from "./application/write_generated_questions.js?v=20260731-question-writer-routing";

/**
 * @typedef {import("./domain/question_generation.js").QuestionGenerationInput}
 * QuestionGenerationInput
 */
/**
 * @typedef {import("./domain/question_generation.js").QuestionGenerationResult}
 * QuestionGenerationResult
 */

const writeGeneratedQuestionsUseCase = new WriteGeneratedQuestions({
  [practiceTypes.ASSESSMENT]: writeQuestions,
  [practiceTypes.PRE_ASSESSMENT]: writePreAssessmentQuestions
});

async function writeGeneratedQuestions(questionInputs) {
  return writeGeneratedQuestionsUseCase.execute(questionInputs);
}

const generateQuestionsUseCase = new GenerateQuestions({
  generatePrompt: generateLlmPrompt,
  generateLlmText,
  getSyllabusById,
  writeQuestions: writeGeneratedQuestions,
  llmOptions: DEEPSEEK_REQUEST_PROFILES.STANDARD_PRO
});
const generateQuestionsWithDiagramUseCase = new GenerateQuestions({
  generatePrompt: generateLlmPromptWithDiagram,
  generateLlmText,
  getSyllabusById,
  writeQuestions: writeGeneratedQuestions,
  renderMermaidDiagram,
  hasDiagram: true,
  llmOptions: DEEPSEEK_REQUEST_PROFILES.DIAGRAM_PRO
});
const generatePlannedQuestionsUseCase = new GeneratePlannedQuestions({
  generatePrompt: generateLlmPromptFromPlan,
  generateLlmText,
  getSyllabusById,
  writeQuestions: writeGeneratedQuestions,
  renderMermaidDiagram,
  llmOptions: DEEPSEEK_REQUEST_PROFILES.DIAGRAM_PRO
});
const loadQuestionGeneratorOptionsUseCase =
  new LoadQuestionGeneratorOptions(loadLlmPromptGeneratorOptions);

/**
 * @param {string} llmPromptConfigId
 * @param {string} syllabusId
 * @param {QuestionGenerationInput} generationInput
 * @returns {Promise<QuestionGenerationResult>}
 */
async function generateQuestions(
  llmPromptConfigId,
  syllabusId,
  generationInput
) {
  return generateQuestionsUseCase.execute(
    llmPromptConfigId,
    syllabusId,
    generationInput
  );
}

/**
 * @param {string} llmPromptConfigId
 * @param {string} syllabusId
 * @param {QuestionGenerationInput} generationInput
 * @returns {Promise<QuestionGenerationResult>}
 */
async function generateQuestionsWithDiagram(
  llmPromptConfigId,
  syllabusId,
  generationInput
) {
  return generateQuestionsWithDiagramUseCase.execute(
    llmPromptConfigId,
    syllabusId,
    generationInput
  );
}

/**
 * @param {string} llmPromptConfigId
 * @param {string} syllabusId
 * @param {import("./domain/question_generation.js").PlannedQuestionGenerationInput} generationInput
 * @returns {Promise<QuestionGenerationResult & {batches: Object[]}>}
 */
async function generatePlannedQuestions(
  llmPromptConfigId,
  syllabusId,
  generationInput
) {
  return generatePlannedQuestionsUseCase.execute(
    llmPromptConfigId,
    syllabusId,
    generationInput
  );
}

async function loadQuestionGeneratorOptions() {
  return loadQuestionGeneratorOptionsUseCase.execute();
}

export {
  generateQuestions,
  generateQuestionsWithDiagram,
  generatePlannedQuestions,
  loadQuestionGeneratorOptions,
  practiceTypes
};
