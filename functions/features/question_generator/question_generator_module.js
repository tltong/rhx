/**
 * External API contracts
 *
 * generateQuestions(configId, syllabusId, generationInput)
 * generateQuestionsWithDiagram(configId, syllabusId, generationInput)
 *   generationInput: {
 *     numberOfQuestions: number,
 *     difficultyLevel: string,
 *     language: string,
 *     group: "assessment"|"pre assessment",
 *     topicId: string,
 *     additionalInstructions?: string
 *   }
 *   Output: Promise<{prompts: string[], questions: Question[]}>.
 *
 * generatePlannedQuestions(configId, syllabusId, generationInput)
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
 *   Output: Promise<{
 *     prompts: string[],
 *     questions: Question[],
 *     batches: Object[]
 *   }>.
 *
 * loadQuestionGeneratorOptions()
 *   Output: Promise<{promptConfigs: Object[], syllabuses: Object[]}>.
 *
 * Generation runs in batches of at most five. Diagram questions are rendered
 * to sanitized SVG on the server before all generated questions are stored.
 */
const {
  renderMermaidDiagram,
} = require("../diagram_generator/diagram_generator_module");
const {
  generateLlmPrompt,
  generateLlmPromptFromPlan,
  generateLlmPromptWithDiagram,
  loadLlmPromptGeneratorOptions,
} = require("../llm_prompt_generator/llm_prompt_generator_module");
const {
  writePreAssessmentQuestions,
} = require("../pre_assessment_question/pre_assessment_question_module");
const {
  getSyllabusById,
} = require("../syllabus/syllabus_module");
const {
  practiceTypes,
  writeQuestions,
} = require("../question/question_module");
const {
  DEEPSEEK_REQUEST_PROFILES,
  generateLlmText,
} = require("../../utils/llm/llm_ops");
const {
  GeneratePlannedQuestions,
} = require("./application/generate_planned_questions");
const {
  GenerateQuestions,
} = require("./application/generate_questions");
const {
  LoadQuestionGeneratorOptions,
} = require("./application/load_question_generator_options");
const {
  WriteGeneratedQuestions,
} = require("./application/write_generated_questions");

const writerUseCase = new WriteGeneratedQuestions({
  [practiceTypes.ASSESSMENT]: writeQuestions,
  [practiceTypes.PRE_ASSESSMENT]: writePreAssessmentQuestions,
});
const writeGeneratedQuestions = (inputs) => writerUseCase.execute(inputs);
const generateQuestionsUseCase = new GenerateQuestions({
  generatePrompt: generateLlmPrompt,
  generateLlmText,
  getSyllabusById,
  writeQuestions: writeGeneratedQuestions,
  llmOptions: DEEPSEEK_REQUEST_PROFILES.STANDARD_PRO,
});
const generateQuestionsWithDiagramUseCase = new GenerateQuestions({
  generatePrompt: generateLlmPromptWithDiagram,
  generateLlmText,
  getSyllabusById,
  writeQuestions: writeGeneratedQuestions,
  renderMermaidDiagram,
  hasDiagram: true,
  llmOptions: DEEPSEEK_REQUEST_PROFILES.DIAGRAM_PRO,
});
const generatePlannedQuestionsUseCase = new GeneratePlannedQuestions({
  generatePrompt: generateLlmPromptFromPlan,
  generateLlmText,
  getSyllabusById,
  writeQuestions: writeGeneratedQuestions,
  renderMermaidDiagram,
  llmOptions: DEEPSEEK_REQUEST_PROFILES.DIAGRAM_PRO,
});
const loadOptionsUseCase = new LoadQuestionGeneratorOptions(
  loadLlmPromptGeneratorOptions,
);

async function generateQuestions(configId, syllabusId, generationInput) {
  return generateQuestionsUseCase.execute(configId, syllabusId, generationInput);
}

async function generateQuestionsWithDiagram(
  configId,
  syllabusId,
  generationInput,
) {
  return generateQuestionsWithDiagramUseCase.execute(
    configId,
    syllabusId,
    generationInput,
  );
}

async function generatePlannedQuestions(configId, syllabusId, generationInput) {
  return generatePlannedQuestionsUseCase.execute(
    configId,
    syllabusId,
    generationInput,
  );
}

async function loadQuestionGeneratorOptions() {
  return loadOptionsUseCase.execute();
}

module.exports = {
  generatePlannedQuestions,
  generateQuestions,
  generateQuestionsWithDiagram,
  loadQuestionGeneratorOptions,
  practiceTypes,
};
