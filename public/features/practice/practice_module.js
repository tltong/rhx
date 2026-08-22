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
 * deletePractice(practiceId: string): Promise<Object>
 *
 * Practice output:
 * {
 *   id: string,
 *   type: "assessment"|"pre assessment",
 *   questions: PracticeQuestionReference[],
 *   dateGenerated: Date
 * }
 */
import {
  practiceTypes
} from "../../config/firebase/practice_schema.js?v=20260816-question-routing";
import {
  CreatePractice
} from "./application/create_practice.js?v=20260816-question-routing";
import {
  DeletePractice
} from "./application/delete_practice.js?v=20260731-practice-replacement";
import {
  GetPractice
} from "./application/get_practice.js?v=20260731-practice-replacement";
import {
  GetPracticeQuestionIds
} from "./application/get_practice_question_ids.js?v=20260816-practice-question-ids";
import {
  FirestorePracticeRepository
} from "./infrastructure/firestore_practice_repository.js?v=20260816-question-routing";

/** @typedef {import("./domain/practice.js").PracticeInput} PracticeInput */
/** @typedef {import("./domain/practice.js").Practice} Practice */

const practiceRepository = new FirestorePracticeRepository();
const createPracticeUseCase = new CreatePractice(practiceRepository);
const deletePracticeUseCase = new DeletePractice(practiceRepository);
const getPracticeUseCase = new GetPractice(practiceRepository);
const getPracticeQuestionIdsUseCase = new GetPracticeQuestionIds(
  practiceRepository
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

export {
  getPracticeById,
  getPracticeQuestionIds,
  createPractice,
  deletePractice,
  practiceTypes
};
