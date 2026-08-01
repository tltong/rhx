import {
  FirestoreSyllabusRepository
} from "./infrastructure/firestore_syllabus_repository.js?v=20260730-topic-pre-assessment";
import {
  GetSyllabus
} from "./application/get_syllabus.js?v=20260730-topic-pre-assessment";
import {
  ListSyllabuses
} from "./application/list_syllabuses.js?v=20260730-topic-pre-assessment";
import {
  CreateSyllabus
} from "./application/create_syllabus.js?v=20260730-topic-pre-assessment";
import {
  UpdateSyllabus
} from "./application/update_syllabus.js?v=20260730-topic-pre-assessment";
import {
  DeleteSyllabus
} from "./application/delete_syllabus.js?v=20260730-topic-pre-assessment";
import {
  AddSyllabusLanguage
} from "./application/add_syllabus_language.js?v=20260730-topic-pre-assessment";
import {
  DeleteSyllabusLanguage
} from "./application/delete_syllabus_language.js?v=20260730-topic-pre-assessment";
import {
  AssignTopicPreAssessmentPractice
} from "./application/assign_topic_pre_assessment_practice.js?v=20260730-topic-pre-assessment";
import {
  GetTopicPreAssessmentPractice
} from "./application/get_topic_pre_assessment_practice.js?v=20260730-topic-pre-assessment";
import {
  ListTopicPreAssessmentPractices
} from "./application/list_topic_pre_assessment_practices.js?v=20260730-topic-pre-assessment";
import {
  RemoveTopicPreAssessmentPractice
} from "./application/remove_topic_pre_assessment_practice.js?v=20260730-topic-pre-assessment";

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
const assignTopicPreAssessmentPracticeUseCase =
  new AssignTopicPreAssessmentPractice(syllabusRepository);
const getTopicPreAssessmentPracticeUseCase =
  new GetTopicPreAssessmentPractice(syllabusRepository);
const listTopicPreAssessmentPracticesUseCase =
  new ListTopicPreAssessmentPractices(syllabusRepository);
const removeTopicPreAssessmentPracticeUseCase =
  new RemoveTopicPreAssessmentPractice(syllabusRepository);

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

async function assignTopicPreAssessmentPractice(
  syllabusId,
  topicId,
  language,
  practiceId
) {
  return assignTopicPreAssessmentPracticeUseCase.execute(
    syllabusId,
    topicId,
    language,
    practiceId
  );
}

async function getTopicPreAssessmentPractice(
  syllabusId,
  topicId,
  language
) {
  return getTopicPreAssessmentPracticeUseCase.execute(
    syllabusId,
    topicId,
    language
  );
}

async function listTopicPreAssessmentPractices(syllabusId, topicId) {
  return listTopicPreAssessmentPracticesUseCase.execute(
    syllabusId,
    topicId
  );
}

async function removeTopicPreAssessmentPractice(
  syllabusId,
  topicId,
  language
) {
  return removeTopicPreAssessmentPracticeUseCase.execute(
    syllabusId,
    topicId,
    language
  );
}

export {
  getSyllabusById,
  listSyllabuses,
  findSyllabusesByScope,
  createSyllabusRecord,
  updateSyllabusRecord,
  deleteSyllabusRecord,
  addSyllabusLanguage,
  deleteSyllabusLanguage,
  assignTopicPreAssessmentPractice,
  getTopicPreAssessmentPractice,
  listTopicPreAssessmentPractices,
  removeTopicPreAssessmentPractice
};
