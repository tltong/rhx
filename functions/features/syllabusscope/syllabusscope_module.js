/**
 * Public APIs:
 *
 * getSyllabusScopeById(syllabusScopeId)
 *   Input: syllabusScopeId: string.
 *   Output: Promise<SyllabusScope|null>.
 *
 * findSyllabusScopeByCountry(country)
 *   Input: country: string.
 *   Output: Promise<SyllabusScope|null>.
 *
 * listSyllabusScopes()
 *   Input: none.
 *   Output: Promise<SyllabusScope[]>.
 *
 * listSyllabusScopeCountries()
 *   Input: none.
 *   Output: Promise<string[]>.
 *
 * createSyllabusScopeRecord(data)
 *   Input: {id, country, languages?: string[], levels?: Object}.
 *   Output: Promise<SyllabusScope>.
 *
 * updateSyllabusScopeRecord(syllabusScope, changes)
 *   Input: SyllabusScope and {country?, languages?, levels?}.
 *   Output: Promise<SyllabusScope>.
 *
 * deleteSyllabusScopeRecord(syllabusScopeId)
 *   Input: syllabusScopeId: string.
 *   Output: Promise<void>.
 *
 * addSyllabusScopeLanguage(syllabusScopeId, language)
 * deleteSyllabusScopeLanguage(syllabusScopeId, language)
 *   Input: syllabusScopeId: string, language: string.
 *   Output: Promise<SyllabusScope>.
 */
const {
  FirestoreSyllabusScopeRepository,
} = require(
  "./infrastructure/firestore_syllabusscope_repository",
);
const {
  GetSyllabusScope,
} = require("./application/get_syllabusscope");
const {
  CreateSyllabusScope,
} = require("./application/create_syllabusscope");
const {
  UpdateSyllabusScope,
} = require("./application/update_syllabusscope");
const {
  DeleteSyllabusScope,
} = require("./application/delete_syllabusscope");
const {
  AddSyllabusScopeLanguage,
} = require("./application/add_syllabusscope_language");
const {
  DeleteSyllabusScopeLanguage,
} = require("./application/delete_syllabusscope_language");
const {
  ListSyllabusScopeCountries,
} = require("./application/list_syllabusscope_countries");

const syllabusScopeRepository = new FirestoreSyllabusScopeRepository();
const getSyllabusScope = new GetSyllabusScope(syllabusScopeRepository);
const createSyllabusScope = new CreateSyllabusScope(
  syllabusScopeRepository,
);
const updateSyllabusScope = new UpdateSyllabusScope(
  syllabusScopeRepository,
);
const deleteSyllabusScope = new DeleteSyllabusScope(
  syllabusScopeRepository,
);
const addSyllabusScopeLanguageUseCase = new AddSyllabusScopeLanguage(
  syllabusScopeRepository,
);
const deleteSyllabusScopeLanguageUseCase =
  new DeleteSyllabusScopeLanguage(syllabusScopeRepository);
const listSyllabusScopeCountriesUseCase =
  new ListSyllabusScopeCountries(syllabusScopeRepository);

async function getSyllabusScopeById(syllabusScopeId) {
  return getSyllabusScope.execute(syllabusScopeId);
}

async function findSyllabusScopeByCountry(country) {
  return syllabusScopeRepository.findByCountry(country);
}

async function listSyllabusScopes() {
  return syllabusScopeRepository.list();
}

async function listSyllabusScopeCountries() {
  return listSyllabusScopeCountriesUseCase.execute();
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
  return addSyllabusScopeLanguageUseCase.execute(
    syllabusScopeId,
    language,
  );
}

async function deleteSyllabusScopeLanguage(syllabusScopeId, language) {
  return deleteSyllabusScopeLanguageUseCase.execute(
    syllabusScopeId,
    language,
  );
}

module.exports = {
  getSyllabusScopeById,
  findSyllabusScopeByCountry,
  listSyllabusScopes,
  listSyllabusScopeCountries,
  createSyllabusScopeRecord,
  updateSyllabusScopeRecord,
  deleteSyllabusScopeRecord,
  addSyllabusScopeLanguage,
  deleteSyllabusScopeLanguage,
};
