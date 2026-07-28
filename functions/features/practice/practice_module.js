const {
  practiceTypes,
} = require("../../schema/practice_schema");
const {
  CreatePractice,
} = require("./application/create_practice");
const {
  FirestorePracticeRepository,
} = require("./infrastructure/firestore_practice_repository");

/**
 * @typedef {import("./domain/practice").PracticeInput} PracticeInput
 * @typedef {import("./domain/practice").Practice} Practice
 */

const practiceRepository = new FirestorePracticeRepository();
const createPracticeUseCase = new CreatePractice(practiceRepository);

/**
 * @param {PracticeInput} practiceInput
 * @returns {Promise<Practice>}
 */
async function createPractice(practiceInput) {
  return createPracticeUseCase.execute(practiceInput);
}

module.exports = {
  createPractice,
  practiceTypes,
};
