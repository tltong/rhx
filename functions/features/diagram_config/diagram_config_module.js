const {
  FirestoreDiagramConfigRepository,
} = require(
  "./infrastructure/firestore_diagram_config_repository",
);
const {
  GetDiagramConfig,
} = require("./application/get_diagram_config");
const {
  ListDiagramConfigs,
} = require("./application/list_diagram_configs");

const diagramConfigRepository =
  new FirestoreDiagramConfigRepository();
const getDiagramConfig =
  new GetDiagramConfig(diagramConfigRepository);
const listDiagramConfigsUseCase =
  new ListDiagramConfigs(diagramConfigRepository);

async function getDiagramConfigBySyllabusId(syllabusId) {
  return getDiagramConfig.execute(syllabusId);
}

async function listDiagramConfigs() {
  return listDiagramConfigsUseCase.execute();
}

module.exports = {
  getDiagramConfigBySyllabusId,
  listDiagramConfigs,
};
