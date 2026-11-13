import {loadStudentEssayHistory} from "../essay_question_generator/infrastructure/student_essay_history.js?v=20261112-essay-variation-v1";
/** Administrator demo only. The browser exposes no persisted generation operation. */
import {DEEPSEEK_REQUEST_PROFILES} from "../../utils/llm/deepseek_util.js?v=20260822-question-temperature";
import {getFirestoreDb} from "../../utils/firebase/firebase_ops.js";
import {generateLlmText} from "../../utils/llm/llm_util.js?v=20261015-deepseek-deadline-v1";
import {getSyllabusById} from "../syllabus/syllabus_module.js?v=20261108-topic-tutor-v1";
import {FirestoreSubjectAssessmentConfigRepository} from "../subject_assessment_config/infrastructure/firestore_subject_assessment_config_repository.js?v=20261108-subject-assessment-config-v1";
import {requireAdministrator} from "../subject_assessment/infrastructure/access.js?v=20261112-essay-variation-v1";
import {FirestoreStudentContentHistory} from "./infrastructure/firestore_student_content_history.js?v=20261112-essay-variation-v1";
import {SubjectAssessmentContentPool} from "./infrastructure/subject_assessment_content_pool.js?v=20261112-essay-variation-v1";
import {GenerateSubjectAssessment} from "./application/generate_subject_assessment.js?v=20261112-essay-variation-v1";
import {FirestorePassageRepository} from "../fill_in_the_blanks_question_generator/infrastructure/firestore_passage_repository.js?v=20261105-chinese-count-v1";
import {getEssayQuestionGeneratorConfig} from "../essay_question_generator/essay_question_generator_module.js?v=20261112-essay-variation-v1";
import {createDefaultConfiguration} from "../essay_question_generator/domain/essay_question_generator_config.js?v=20261112-essay-variation-v1";
import {getFillInTheBlanksQuestionGeneratorConfig} from "../fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module.js?v=20261105-chinese-count-v1";
import {getDefaultLlmPromptConfig} from "../llm_prompt_config/llm_prompt_config_module.js?v=20261104-fill-preassessment-v3";
import {getTopicDiagramPercentage} from "../diagram_config/diagram_config_module.js?v=20261104-fill-preassessment-v3";
import {generateLlmPrompt, generateLlmPromptWithDiagram} from "../llm_prompt_generator/llm_prompt_generator_module.js?v=20261104-fill-preassessment-v3";
import {renderMermaidDiagram} from "../diagram_generator/diagram_generator_module.js?v=20261104-fill-preassessment-v3";
import {getRandomQuestionSeedEntry, getQuestionSeedEntries, getDefaultQuestionSeedTheme} from "../question_seed_generator/question_seed_generator_module.js?v=20261104-fill-preassessment-v3";
import {generateImage} from "../image_generation/image_generation_module.js?v=20261021-image-generation-v1";

const noWrite = () => {throw new Error("Demo generation cannot save content.");};
export function createSubjectAssessmentGenerator({getDb = getFirestoreDb, authorize = requireAdministrator,
  configurations = new FirestoreSubjectAssessmentConfigRepository({getDb}), history = new FirestoreStudentContentHistory({getDb}),
  loadContext = async input => ({...await configurations.options(input), configuration: await configurations.get(input), syllabus: await getSyllabusById(input.syllabusId)}),
  createPool = run => {
    const repository = new FirestorePassageRepository({getDb});
    return new SubjectAssessmentContentPool(run, {getDb, loadStudentEssayHistory, getQuestionSeedEntries, getDefaultQuestionSeedTheme,
      generateText: (prompt, options) => generateLlmText(prompt, {...options, useDirectFunction: true}),
      llmProfiles: DEEPSEEK_REQUEST_PROFILES,
      getDefaultPrompt: getDefaultLlmPromptConfig, getDiagramPercentage: getTopicDiagramPercentage,
      generatePrompt: generateLlmPrompt, generatePromptWithDiagram: generateLlmPromptWithDiagram, renderDiagram: renderMermaidDiagram,
      getRandomQuestionSeedEntry, getEssayConfiguration: async () => await getEssayQuestionGeneratorConfig() || createDefaultConfiguration(),
      getPassageConfiguration: getFillInTheBlanksQuestionGeneratorConfig,
      passages: {list: (...args) => repository.list(...args), get: (...args) => repository.get(...args), summaries: (...args) => repository.summaries(...args), save: noWrite},
      writeQuestion: noWrite, saveEssayQuestion: noWrite, createEssayPicture: noWrite, createPassagePicture: noWrite,
      generateImage, random: Math.random});
  }, ...options} = {}) {
  const engine = new GenerateSubjectAssessment({authorize, loadContext, history, createPool, ...options});
  return {previewSubjectAssessment: (input, options) => engine.execute(input, {...options, previewOnly: true})};
}
export const {previewSubjectAssessment} = createSubjectAssessmentGenerator();
