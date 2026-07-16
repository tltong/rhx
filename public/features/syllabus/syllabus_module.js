import {
  FirestoreSyllabusRepository
} from "./infrastructure/firestore_syllabus_repository.js?v=20260716-no-eager-auth";
import {
  GetSyllabus
} from "./application/get_syllabus.js?v=20260716-no-eager-auth";
import {
  ListSyllabuses
} from "./application/list_syllabuses.js?v=20260716-no-eager-auth";
import {
  CreateSyllabus
} from "./application/create_syllabus.js?v=20260716-no-eager-auth";
import {
  UpdateSyllabus
} from "./application/update_syllabus.js?v=20260716-no-eager-auth";
import {
  DeleteSyllabus
} from "./application/delete_syllabus.js?v=20260716-no-eager-auth";

const syllabusRepository = new FirestoreSyllabusRepository();
const getSyllabus = new GetSyllabus(syllabusRepository);
const listSyllabusesUseCase = new ListSyllabuses(syllabusRepository);
const createSyllabus = new CreateSyllabus(syllabusRepository);
const updateSyllabus = new UpdateSyllabus(syllabusRepository);
const deleteSyllabus = new DeleteSyllabus(syllabusRepository);

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

export {
  getSyllabusById,
  listSyllabuses,
  findSyllabusesByScope,
  createSyllabusRecord,
  updateSyllabusRecord,
  deleteSyllabusRecord
};
