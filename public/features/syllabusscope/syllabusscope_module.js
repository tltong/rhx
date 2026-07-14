import { FirestoreSyllabusScopeRepository } from "./infrastructure/firestore_syllabusscope_repository.js?v=20260715-module-api";
import { GetSyllabusScope } from "./application/get_syllabusscope.js?v=20260715-module-api";
import { CreateSyllabusScope } from "./application/create_syllabusscope.js?v=20260715-module-api";
import { UpdateSyllabusScope } from "./application/update_syllabusscope.js?v=20260715-module-api";
import { DeleteSyllabusScope } from "./application/delete_syllabusscope.js?v=20260715-module-api";

const syllabusScopeRepository = new FirestoreSyllabusScopeRepository();
const getSyllabusScope = new GetSyllabusScope(syllabusScopeRepository);
const createSyllabusScope = new CreateSyllabusScope(syllabusScopeRepository);
const updateSyllabusScope = new UpdateSyllabusScope(syllabusScopeRepository);
const deleteSyllabusScope = new DeleteSyllabusScope(syllabusScopeRepository);

async function getSyllabusScopeById(syllabusScopeId) {
  return getSyllabusScope.execute(syllabusScopeId);
}

async function findSyllabusScopeByCountry(country) {
  return syllabusScopeRepository.findByCountry(country);
}

async function listSyllabusScopes() {
  return syllabusScopeRepository.list();
}

async function createSyllabusScopeRecord(data) {
  return createSyllabusScope.execute(data);
}

async function updateSyllabusScopeRecord(syllabusScope, changes) {
  return updateSyllabusScope.execute(syllabusScope, changes);
}

async function deleteSyllabusScopeRecord(syllabusScopeId) {
  return deleteSyllabusScope.execute(syllabusScopeId);
}

export {
  getSyllabusScopeById,
  findSyllabusScopeByCountry,
  listSyllabusScopes,
  createSyllabusScopeRecord,
  updateSyllabusScopeRecord,
  deleteSyllabusScopeRecord
};
