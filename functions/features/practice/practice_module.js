/**
 * External APIs
 *
 * getPracticeById(practiceId: string): Promise<Practice|null>
 *
 * getPracticeQuestionIds(practiceId: string): Promise<string[]>
 *   Throws when the practice does not exist.
 *
 * createPractice({
 *   type: "assessment"|"pre assessment",
 *   questions: Array<{
 *     syllabusId: string,
 *     topicId: string,
 *     language?: string,
 *     hasDiagram?: boolean,
 *     questionId: string
 *   }>,
 *   dateGenerated?: Date|string|number
 * }): Promise<Practice>
 *   language and hasDiagram are required for assessment practices and are
 *   omitted for pre-assessment practices.
 *
 * deletePractice(practiceId: string): Promise<{id: string, path: string}>
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
  DeletePractice,
} = require("./application/delete_practice");
const {
  GetPractice,
} = require("./application/get_practice");
const {
  GetPracticeQuestionIds,
} = require("./application/get_practice_question_ids");
const {
  FirestorePracticeRepository,
} = require("./infrastructure/firestore_practice_repository");

/**
 * @typedef {import("./domain/practice").PracticeInput} PracticeInput
 * @typedef {import("./domain/practice").Practice} Practice
 */

const practiceRepository = new FirestorePracticeRepository();
const createPracticeUseCase = new CreatePractice(practiceRepository);
const deletePracticeUseCase = new DeletePractice(practiceRepository);
const getPracticeUseCase = new GetPractice(practiceRepository);
const getPracticeQuestionIdsUseCase = new GetPracticeQuestionIds(
  practiceRepository,
);

/**
 * @param {string} practiceId
 * @returns {Promise<Practice|null>}
 */
async function getPracticeById(practiceId) {
  return getPracticeUseCase.execute(practiceId);
}

/**
 * @param {string} practiceId
 * @returns {Promise<string[]>}
 */
async function getPracticeQuestionIds(practiceId) {
  return getPracticeQuestionIdsUseCase.execute(practiceId);
}

/**
 * @param {PracticeInput} practiceInput
 * @returns {Promise<Practice>}
 */
async function createPractice(practiceInput) {
  return createPracticeUseCase.execute(practiceInput);
}

async function deletePractice(practiceId) {
  return deletePracticeUseCase.execute(practiceId);
}

module.exports = {
  getPracticeById,
  getPracticeQuestionIds,
  createPractice,
  deletePractice,
  practiceTypes,
};
