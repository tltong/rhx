/**
 * External APIs
 *
 * getPracticeById(practiceId: string): Promise<Practice|null>
 *
 * createPractice({
 *   type: "assessment"|"pre assessment",
 *   questions: Array<{
 *     syllabusId: string,
 *     topicId: string,
 *     questionId: string
 *   }>,
 *   dateGenerated?: Date|string|number
 * }): Promise<Practice>
 *
 * Practice output:
 * {
 *   id: string,
 *   type: "assessment"|"pre assessment",
 *   questions: PracticeQuestionReference[],
 *   dateGenerated: Date
 * }
 */
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
