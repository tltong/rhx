/**
 * Generates one medium-difficulty essay practice and attaches it to a syllabus topic/language.
 * generateEssayPractice({syllabusId, topicId, language}, backendContext?)
 *   -> Promise<{practice, assignment, question, questions, syllabusId, topicId, topicName, language, replacement}>
 * loadEssayPractice({syllabusId, topicId, language}) -> Promise<object|null>
 * Level and grade come from the syllabus; the seed is one matching random theme.
 * No Assessment Framework dependency, no student assignment and no Firebase endpoints.
 * Backend generation requires trusted {updatedBy}; web generation requires a verified site administrator.
 */
const {getSyllabusById, assignTopicPreAssessmentPractice} = require("../syllabus/syllabus_module");
const {getRandomQuestionSeedEntry} = require("../question_seed_generator/question_seed_generator_module");
const {generateEssayQuestion, getEssayQuestionById} = require("../essay_question_generator/essay_question_generator_module");
const {createEssayPractice, getEssayPracticeById} = require("../essay_practice/essay_practice_module");
const {GenerateEssayPractice} = require("./application/generate_essay_practice");

async function administratorAccess(context) {
  if (typeof context?.updatedBy !== "string" || !context.updatedBy.trim()) throw new Error("updatedBy is required.");
  return {uid: context.updatedBy.trim()};
}

const generator = new GenerateEssayPractice({
  getSyllabusById, assignTopicPreAssessmentPractice, getRandomQuestionSeedEntry,
  generateEssayQuestion, getEssayQuestionById, createEssayPractice, getEssayPracticeById,
  requireAdministrator: administratorAccess,
});
async function generateEssayPractice(input, context) {return generator.execute(input, context);}
async function loadEssayPractice(input) {
  return generator.load(input);
}

module.exports = {generateEssayPractice, loadEssayPractice};

