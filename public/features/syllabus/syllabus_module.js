import {
  FirestoreSyllabusRepository
} from "./infrastructure/firestore_syllabus_repository.js?v=20260718-syllabus-languages";
import {
  GetSyllabus
} from "./application/get_syllabus.js?v=20260718-syllabus-languages";
import {
  ListSyllabuses
} from "./application/list_syllabuses.js?v=20260718-syllabus-languages";
import {
  CreateSyllabus
} from "./application/create_syllabus.js?v=20260718-syllabus-languages";
import {
  UpdateSyllabus
} from "./application/update_syllabus.js?v=20260718-syllabus-languages";
import {
  DeleteSyllabus
} from "./application/delete_syllabus.js?v=20260718-syllabus-languages";
import {
  AddSyllabusLanguage
} from "./application/add_syllabus_language.js?v=20260718-syllabus-languages";
import {
  DeleteSyllabusLanguage
} from "./application/delete_syllabus_language.js?v=20260718-syllabus-languages";

const syllabusRepository = new FirestoreSyllabusRepository();
const getSyllabus = new GetSyllabus(syllabusRepository);
const listSyllabusesUseCase = new ListSyllabuses(syllabusRepository);
const createSyllabus = new CreateSyllabus(syllabusRepository);
const updateSyllabus = new UpdateSyllabus(syllabusRepository);
const deleteSyllabus = new DeleteSyllabus(syllabusRepository);
const addSyllabusLanguageUseCase = new AddSyllabusLanguage(
  syllabusRepository
);
const deleteSyllabusLanguageUseCase = new DeleteSyllabusLanguage(
  syllabusRepository
);

async function getSyllabusById(syllabusId) {
  return getSyllabus.execute(syllabusId);
}

async function listSyllabuses() {
  return listSyllabusesUseCase.execute();
}

async function findSyllabusesByScope(scope) {
  return syllabusRepository.findByScope(scope);
}

async function createSyllabusRecord(data) {
  return createSyllabus.execute(data);
}

async function updateSyllabusRecord(syllabus, changes) {
  return updateSyllabus.execute(syllabus, changes);
}

async function deleteSyllabusRecord(syllabusId) {
  return deleteSyllabus.execute(syllabusId);
}

async function addSyllabusLanguage(syllabusId, language) {
  return addSyllabusLanguageUseCase.execute(syllabusId, language);
}

async function deleteSyllabusLanguage(syllabusId, language) {
  return deleteSyllabusLanguageUseCase.execute(syllabusId, language);
}

export {
  getSyllabusById,
  listSyllabuses,
  findSyllabusesByScope,
  createSyllabusRecord,
  updateSyllabusRecord,
  deleteSyllabusRecord,
  addSyllabusLanguage,
  deleteSyllabusLanguage
};
