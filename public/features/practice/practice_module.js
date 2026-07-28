import {
  practiceTypes
} from "../../config/firebase/practice_schema.js";
import {
  CreatePractice
} from "./application/create_practice.js?v=20260727-practice-create";
import {
  FirestorePracticeRepository
} from "./infrastructure/firestore_practice_repository.js?v=20260727-practice-create";

/** @typedef {import("./domain/practice.js").PracticeInput} PracticeInput */
/** @typedef {import("./domain/practice.js").Practice} Practice */

const practiceRepository = new FirestorePracticeRepository();
const createPracticeUseCase = new CreatePractice(practiceRepository);

/**
 * @param {PracticeInput} practiceInput
 * @returns {Promise<Practice>}
 */
async function createPractice(practiceInput) {
  return createPracticeUseCase.execute(practiceInput);
}

export {
  createPractice,
  practiceTypes
};
