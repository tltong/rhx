import {
  getSyllabusById,
  listSyllabuses
} from "../syllabus/syllabus_module.js?v=20260724-diagram-config";
import {
  GetDiagramConfig
} from "./application/get_diagram_config.js?v=20260724-diagram-config";
import {
  ListDiagramConfigSyllabuses
} from "./application/list_diagram_config_syllabuses.js?v=20260724-diagram-config";
import {
  SaveDiagramConfig
} from "./application/save_diagram_config.js?v=20260724-diagram-config";
import {
  FirestoreDiagramConfigRepository
} from "./infrastructure/firestore_diagram_config_repository.js?v=20260724-diagram-config";

const diagramConfigRepository = new FirestoreDiagramConfigRepository();
const getDiagramConfigUseCase = new GetDiagramConfig({
  diagramConfigRepository,
  getSyllabusById
});
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

async function saveDiagramConfigForSyllabus(
  syllabusId,
  topicConfigs
) {
  return saveDiagramConfigUseCase.execute(syllabusId, topicConfigs);
}

export {
  getDiagramConfigForSyllabus,
  listDiagramConfigSyllabuses,
  saveDiagramConfigForSyllabus
};
