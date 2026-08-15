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
} from "../../config/firebase/practice_schema.js";
import {
  CreatePractice
} from "./application/create_practice.js?v=20260731-practice-replacement";
import {
  DeletePractice
} from "./application/delete_practice.js?v=20260731-practice-replacement";
import {
  GetPractice
} from "./application/get_practice.js?v=20260731-practice-replacement";
import {
  FirestorePracticeRepository
} from "./infrastructure/firestore_practice_repository.js?v=20260731-practice-replacement";

/** @typedef {import("./domain/practice.js").PracticeInput} PracticeInput */
/** @typedef {import("./domain/practice.js").Practice} Practice */

const practiceRepository = new FirestorePracticeRepository();
const createPracticeUseCase = new CreatePractice(practiceRepository);
const deletePracticeUseCase = new DeletePractice(practiceRepository);
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

async function deletePractice(practiceId) {
  return deletePracticeUseCase.execute(practiceId);
}

export {
  getPracticeById,
  createPractice,
  deletePractice,
  practiceTypes
};
