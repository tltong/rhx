const {
  FirestoreDiagramConfigRepository,
} = require(
  "./infrastructure/firestore_diagram_config_repository",
);
const {
  GetDiagramConfig,
} = require("./application/get_diagram_config");
const {
  GetTopicDiagramPercentage,
} = require("./application/get_topic_diagram_percentage");
const {
  ListDiagramConfigs,
} = require("./application/list_diagram_configs");

const diagramConfigRepository =
  new FirestoreDiagramConfigRepository();
const getDiagramConfig =
  new GetDiagramConfig(diagramConfigRepository);
const getTopicDiagramPercentageUseCase =
  new GetTopicDiagramPercentage(getDiagramConfigBySyllabusId);
const listDiagramConfigsUseCase =
  new ListDiagramConfigs(diagramConfigRepository);

async function getDiagramConfigBySyllabusId(syllabusId) {
  return getDiagramConfig.execute(syllabusId);
}

/**
 * @param {string} syllabusId
 * @param {string} topicId
 * @returns {Promise<number>} A percentage from 0 through 100.
 */
async function getTopicDiagramPercentage(syllabusId, topicId) {
  return getTopicDiagramPercentageUseCase.execute(syllabusId, topicId);
}

async function listDiagramConfigs() {
  return listDiagramConfigsUseCase.execute();
}

module.exports = {
  getDiagramConfigBySyllabusId,
  getTopicDiagramPercentage,
  listDiagramConfigs,
};
