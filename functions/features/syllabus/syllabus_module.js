const {
  FirestoreSyllabusRepository,
} = require("./infrastructure/firestore_syllabus_repository");
const { GetSyllabus } = require("./application/get_syllabus");
const { ListSyllabuses } = require("./application/list_syllabuses");

const syllabusRepository = new FirestoreSyllabusRepository();
const getSyllabus = new GetSyllabus(syllabusRepository);
const listSyllabusesUseCase = new ListSyllabuses(syllabusRepository);

async function getSyllabusById(syllabusId) {
  return getSyllabus.execute(syllabusId);
}

async function listSyllabuses() {
  return listSyllabusesUseCase.execute();
}

module.exports = {
  getSyllabusById,
  listSyllabuses,
};
