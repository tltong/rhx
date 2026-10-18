/**
 * Shared essay practice APIs. Each practice references exactly one saved essay question.
 * createEssayPractice({essayQuestionId}) -> Promise<{id, essayQuestionId}>
 * getEssayPracticeById(practiceId) -> Promise<{id, essayQuestionId}|null>
 * Storage: essayPractices/{practiceId}; independent of student assignments.
 * Web creation requires a verified site administrator; reads require sign-in.
 * No Firebase endpoints are exported.
 */
const {getEssayQuestionById} = require("../essay_question_generator/essay_question_generator_module");
const {CreateEssayPractice} = require("./application/create_essay_practice");
const {GetEssayPracticeById} = require("./application/get_essay_practice_by_id");
const {FirestoreEssayPracticeRepository} = require("./infrastructure/firestore_essay_practice_repository");

const repository = new FirestoreEssayPracticeRepository();
const create = new CreateEssayPractice({repository, getEssayQuestionById});
const get = new GetEssayPracticeById(repository);

async function createEssayPractice(input) {
  return create.execute(input);
}
async function getEssayPracticeById(practiceId) {
  return get.execute(practiceId);
}

module.exports = {createEssayPractice, getEssayPracticeById};

