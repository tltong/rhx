/**
 * Topic framework APIs (feature APIs; no Firebase callable endpoints).
 * getTopicAssessmentFrameworkId({syllabusId, topicId, language}) -> string|null.
 * Resolves only the topic/language assignment; there is no syllabus default.
 * assignTopicAssessmentFramework({syllabusId, topicId, language, assessmentFrameworkId})
 * saves a reference; null clears a draft topic without an attached practice.
 * Framework type determines the topic question type. Web binding writes require a site administrator.
 */
import {getAssessmentFrameworkById} from "../assessment_framework/assessment_framework_module.js?v=20261105-mcq-adoption-v1";
import {resolveTopicAssessmentFrameworkId} from "./domain/syllabus.js?v=20261105-topic-framework-v1";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js";
import {requireCurrentFirebaseAuthUser} from "../../utils/firebase/firebase_auth.js";
import {AssignTopicAssessmentFramework, GetTopicAssessmentFrameworkId} from "./application/topic_assessment_framework.js?v=20261105-topic-framework-v1";
import {preAssessmentPracticeTypes} from "../../config/firebase/syllabuses_schema.js?v=20261105-topic-framework-v1";
import {
  FirestoreSyllabusRepository
} from "./infrastructure/firestore_syllabus_repository.js?v=20261105-topic-framework-v1";
import {
  GetSyllabus
} from "./application/get_syllabus.js?v=20261104-fill-preassessment-v3";
import {
  ListSyllabuses
} from "./application/list_syllabuses.js?v=20261104-fill-preassessment-v3";
import {
  CreateSyllabus
} from "./application/create_syllabus.js?v=20261105-topic-framework-v1";
import {
  UpdateSyllabus
} from "./application/update_syllabus.js?v=20261105-topic-framework-v1";
import {
  DeleteSyllabus
} from "./application/delete_syllabus.js?v=20261104-fill-preassessment-v3";
import {
  AddSyllabusLanguage
} from "./application/add_syllabus_language.js?v=20261104-fill-preassessment-v3";
import {
  DeleteSyllabusLanguage
} from "./application/delete_syllabus_language.js?v=20261104-fill-preassessment-v3";
import {
  AssignTopicPreAssessmentPractice
} from "./application/assign_topic_pre_assessment_practice.js?v=20261105-topic-framework-v1";
import {
  GetTopicPreAssessmentPractice
} from "./application/get_topic_pre_assessment_practice.js?v=20261104-fill-preassessment-v3";
import {
  ListTopicPreAssessmentPractices
} from "./application/list_topic_pre_assessment_practices.js?v=20261104-fill-preassessment-v3";
import {
  RemoveTopicPreAssessmentPractice
} from "./application/remove_topic_pre_assessment_practice.js?v=20261104-fill-preassessment-v3";

import {
  IsTopicPausable
} from "./application/is_topic_pausable.js?v=20261104-fill-preassessment-v3";

const syllabusRepository = new FirestoreSyllabusRepository();
const topicFrameworkReader = new GetTopicAssessmentFrameworkId(syllabusRepository);
const topicFrameworkWriter = new AssignTopicAssessmentFramework({repository: syllabusRepository, getAssessmentFrameworkById});
async function getTopicAssessmentFrameworkId(input) {return topicFrameworkReader.execute(input);}
async function assignTopicAssessmentFramework(input, context) {
  const user = requireCurrentFirebaseAuthUser();
  await requireCurrentSiteAdmin();
  const assertAccess = () => {
    const current = requireCurrentFirebaseAuthUser();
    if (current.uid !== user.uid || current.email !== user.email || current.emailVerified !== user.emailVerified) throw new Error("The signed-in account changed.");
  };
  assertAccess();
  return topicFrameworkWriter.execute(input, {assertAccess});
}

const isTopicPausableUseCase = new IsTopicPausable(syllabusRepository);
const getSyllabus = new GetSyllabus(syllabusRepository);
const listSyllabusesUseCase = new ListSyllabuses(syllabusRepository);
const createSyllabus = new CreateSyllabus(syllabusRepository, {getAssessmentFrameworkById});
const updateSyllabus = new UpdateSyllabus(syllabusRepository, {getAssessmentFrameworkById});
const deleteSyllabus = new DeleteSyllabus(syllabusRepository);
const addSyllabusLanguageUseCase = new AddSyllabusLanguage(
  syllabusRepository
);
const deleteSyllabusLanguageUseCase = new DeleteSyllabusLanguage(
  syllabusRepository
);
const assignTopicPreAssessmentPracticeUseCase =
  new AssignTopicPreAssessmentPractice(syllabusRepository, {getAssessmentFrameworkById});
const getTopicPreAssessmentPracticeUseCase =
  new GetTopicPreAssessmentPractice(syllabusRepository);
const listTopicPreAssessmentPracticesUseCase =
  new ListTopicPreAssessmentPractices(syllabusRepository);
const removeTopicPreAssessmentPracticeUseCase =
  new RemoveTopicPreAssessmentPractice(syllabusRepository);

async function getSyllabusById(syllabusId) {
  return getSyllabus.execute(syllabusId);
}


/**
 * @param {string} syllabusId
 * @param {string} topicId
 * @returns {Promise<boolean>} Missing pausable fields default to true.
 */
async function isTopicPausable(syllabusId, topicId) {
  return isTopicPausableUseCase.execute(syllabusId, topicId);
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
  practiceId,
  practiceType = preAssessmentPracticeTypes.NORMAL,
  options
) {
  return assignTopicPreAssessmentPracticeUseCase.execute(
    syllabusId,
    topicId,
    language,
    practiceId,
    practiceType,
    options
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
  assignTopicAssessmentFramework, getTopicAssessmentFrameworkId, resolveTopicAssessmentFrameworkId,
  preAssessmentPracticeTypes,
  getSyllabusById,
  isTopicPausable,
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
