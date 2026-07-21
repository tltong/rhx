import { FirestoreSyllabusScopeRepository } from "./infrastructure/firestore_syllabusscope_repository.js?v=20260718-scope-languages";
import { GetSyllabusScope } from "./application/get_syllabusscope.js?v=20260718-scope-languages";
import { CreateSyllabusScope } from "./application/create_syllabusscope.js?v=20260718-scope-languages";
import { UpdateSyllabusScope } from "./application/update_syllabusscope.js?v=20260718-scope-languages";
import { DeleteSyllabusScope } from "./application/delete_syllabusscope.js?v=20260718-scope-languages";
import { AddSyllabusScopeLanguage } from "./application/add_syllabusscope_language.js?v=20260718-scope-languages";
import { DeleteSyllabusScopeLanguage } from "./application/delete_syllabusscope_language.js?v=20260718-scope-languages";

const syllabusScopeRepository = new FirestoreSyllabusScopeRepository();
const getSyllabusScope = new GetSyllabusScope(syllabusScopeRepository);
const createSyllabusScope = new CreateSyllabusScope(syllabusScopeRepository);
const updateSyllabusScope = new UpdateSyllabusScope(syllabusScopeRepository);
const deleteSyllabusScope = new DeleteSyllabusScope(syllabusScopeRepository);
const addSyllabusScopeLanguageUseCase = new AddSyllabusScopeLanguage(
  syllabusScopeRepository
);
const deleteSyllabusScopeLanguageUseCase = new DeleteSyllabusScopeLanguage(
  syllabusScopeRepository
);

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

async function addSyllabusScopeLanguage(syllabusScopeId, language) {
  return addSyllabusScopeLanguageUseCase.execute(syllabusScopeId, language);
}

async function deleteSyllabusScopeLanguage(syllabusScopeId, language) {
  return deleteSyllabusScopeLanguageUseCase.execute(syllabusScopeId, language);
}

export {
  getSyllabusScopeById,
  findSyllabusScopeByCountry,
  listSyllabusScopes,
  createSyllabusScopeRecord,
  updateSyllabusScopeRecord,
  deleteSyllabusScopeRecord,
  addSyllabusScopeLanguage,
  deleteSyllabusScopeLanguage
};
