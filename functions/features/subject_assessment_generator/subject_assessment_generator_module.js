/**
 * generateSubjectAssessment({studentId,syllabusId,language,requestId?,expectedConfigurationVersion?}, context)
 * previewSubjectAssessment(sameInput, {onProgress?}, context) performs zero database/Storage writes.
 * getSubjectAssessmentGeneration({generationId}, context) returns sanitized progress.
 * retrySubjectAssessmentGeneration is generateSubjectAssessment with the same requestId.
 * New persistence is server-only; no new HTTP endpoint or normal-practice integration.
 */
const {getFirestoreDb} = require("../../utils/firebase/firebase_ops");
const {generateLlmText, DEEPSEEK_REQUEST_PROFILES} = require("../../utils/llm/llm_ops");
const {getSyllabusById} = require("../syllabus/syllabus_module");
const {FirestoreSubjectAssessmentConfigRepository} = require("../subject_assessment_config/infrastructure/firestore_subject_assessment_config_repository");
const {FirestoreSubjectAssessmentRepository} = require("../subject_assessment/infrastructure/firestore_subject_assessment_repository");
const {requireAdministrator} = require("../subject_assessment/infrastructure/access");
const {FirestoreSubjectAssessmentGenerationRepository} = require("./infrastructure/firestore_subject_assessment_generation_repository");
const {FirestoreStudentContentHistory} = require("./infrastructure/firestore_student_content_history");
const {SubjectAssessmentContentPool} = require("./infrastructure/subject_assessment_content_pool");
const {GenerateSubjectAssessment} = require("./application/generate_subject_assessment");
const {FirestorePassageRepository} = require("../fill_in_the_blanks_question_generator/infrastructure/firestore_passage_repository");
const essay = require("../essay_question_generator/essay_question_generator_module");
const {createDefaultConfiguration} = require("../essay_question_generator/domain/essay_question_generator_config");
const {getFillInTheBlanksQuestionGeneratorConfig} = require("../fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module");
const {getDefaultLlmPromptConfig} = require("../llm_prompt_config/llm_prompt_config_module");
const {getTopicDiagramPercentage} = require("../diagram_config/diagram_config_module");
const {generateLlmPrompt, generateLlmPromptWithDiagram} = require("../llm_prompt_generator/llm_prompt_generator_module");
const {renderMermaidDiagram} = require("../diagram_generator/diagram_generator_module");
const {writeQuestion} = require("../question/question_module");
const {getRandomQuestionSeedEntry} = require("../question_seed_generator/question_seed_generator_module");
const {generateImage} = require("../image_generation/image_generation_module");
const {createEssayPicture} = require("../essay_question_generator/infrastructure/essay_picture_service");
const {createPassagePictureService} = require("../fill_in_the_blanks_question_generator/infrastructure/passage_picture_service");

function createSubjectAssessmentGenerator({getDb = getFirestoreDb, authorize = requireAdministrator,
  configurations = new FirestoreSubjectAssessmentConfigRepository({getDb}), assessments = new FirestoreSubjectAssessmentRepository({getDb}),
  history = new FirestoreStudentContentHistory({getDb}), jobs = new FirestoreSubjectAssessmentGenerationRepository({getDb}),
  loadContext = async input => ({...await configurations.options(input), configuration: await configurations.get(input), syllabus: await getSyllabusById(input.syllabusId)}),
  createPool = run => new SubjectAssessmentContentPool(run, {
    getDb, generateText: generateLlmText, llmProfiles: DEEPSEEK_REQUEST_PROFILES, getDefaultPrompt: getDefaultLlmPromptConfig,
    getDiagramPercentage: getTopicDiagramPercentage, generatePrompt: generateLlmPrompt, generatePromptWithDiagram: generateLlmPromptWithDiagram,
    renderDiagram: renderMermaidDiagram, writeQuestion, getRandomQuestionSeedEntry,
    getEssayConfiguration: async () => await essay.getEssayQuestionGeneratorConfig() || createDefaultConfiguration(), saveEssayQuestion: essay.saveEssayQuestion,
    getPassageConfiguration: getFillInTheBlanksQuestionGeneratorConfig, passages: new FirestorePassageRepository({getDb}),
    createEssayPicture: input => createEssayPicture(input, {trusted: true}), createPassagePicture: createPassagePictureService({getDb}),
    generateImage, random: Math.random,
  }), ...options} = {}) {
  const engine = new GenerateSubjectAssessment({authorize, loadContext, history, jobs, assessments, createPool, ...options});
  const generateSubjectAssessment = (input, context) => engine.execute(input, {}, context);
  return {generateSubjectAssessment, retrySubjectAssessmentGeneration: generateSubjectAssessment,
    previewSubjectAssessment: (input, options, context) => engine.execute(input, {...options, previewOnly: true}, context),
    async getSubjectAssessmentGeneration(input, context) {
      const access = await authorize(context), result = await jobs.get(input.generationId); access.assertAccess?.(); return result;
    }};
}
module.exports = {...createSubjectAssessmentGenerator(), createSubjectAssessmentGenerator};
