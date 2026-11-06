import {
  getSyllabusById,
  listSyllabuses
} from "../syllabus/syllabus_module.js?v=20261104-fill-preassessment-v3";
import {
  GetDiagramConfig
} from "./application/get_diagram_config.js?v=20261104-fill-preassessment-v3";
import {
  GetTopicDiagramPercentage
} from "./application/get_topic_diagram_percentage.js?v=20261104-fill-preassessment-v3";
import {
  ListDiagramConfigSyllabuses
} from "./application/list_diagram_config_syllabuses.js?v=20261104-fill-preassessment-v3";
import {
  SaveDiagramConfig
} from "./application/save_diagram_config.js?v=20261104-fill-preassessment-v3";
import {
  FirestoreDiagramConfigRepository
} from "./infrastructure/firestore_diagram_config_repository.js?v=20261104-fill-preassessment-v3";

const diagramConfigRepository = new FirestoreDiagramConfigRepository();
const getDiagramConfigUseCase = new GetDiagramConfig({
  diagramConfigRepository,
  getSyllabusById
});
const getTopicDiagramPercentageUseCase =
  new GetTopicDiagramPercentage(getDiagramConfigForSyllabus);
const listDiagramConfigSyllabusesUseCase =
  new ListDiagramConfigSyllabuses(listSyllabuses);
const saveDiagramConfigUseCase = new SaveDiagramConfig({
  diagramConfigRepository,
  getSyllabusById
});

async function listDiagramConfigSyllabuses() {
  return listDiagramConfigSyllabusesUseCase.execute();
}

async function getDiagramConfigForSyllabus(syllabusId) {
  return getDiagramConfigUseCase.execute(syllabusId);
}

/**
 * @param {string} syllabusId
 * @param {string} topicId
 * @returns {Promise<number>} A percentage from 0 through 100.
 */
async function getTopicDiagramPercentage(syllabusId, topicId) {
  return getTopicDiagramPercentageUseCase.execute(syllabusId, topicId);
}

async function saveDiagramConfigForSyllabus(
  syllabusId,
  topicConfigs
) {
  return saveDiagramConfigUseCase.execute(syllabusId, topicConfigs);
}

export {
  getDiagramConfigForSyllabus,
  getTopicDiagramPercentage,
  listDiagramConfigSyllabuses,
  saveDiagramConfigForSyllabus
};
