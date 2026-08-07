const {
  practiceTypes,
} = require("../../schema/practice_schema");
const {
  CreatePractice,
} = require("./application/create_practice");
const {
  GetPractice,
} = require("./application/get_practice");
const {
  FirestorePracticeRepository,
} = require("./infrastructure/firestore_practice_repository");

/**
 * @typedef {import("./domain/practice").PracticeInput} PracticeInput
 * @typedef {import("./domain/practice").Practice} Practice
 */

const practiceRepository = new FirestorePracticeRepository();
const createPracticeUseCase = new CreatePractice(practiceRepository);
const getPracticeUseCase = new GetPractice(practiceRepository);

/**
 * @param {string} practiceId
 * @returns {Promise<Practice|null>}
 */
async function getPracticeById(practiceId) {
  return getPracticeUseCase.execute(practiceId);
}

/**
 * @param {PracticeInput} practiceInput
 * @returns {Promise<Practice>}
 */
async function createPractice(practiceInput) {
  return createPracticeUseCase.execute(practiceInput);
}

module.exports = {
  getPracticeById,
  createPractice,
  practiceTypes,
};
