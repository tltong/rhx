const {
  DIAGRAM_CONFIGS_COLLECTION,
  DIAGRAM_CONFIG_TOPICS_SUBCOLLECTION,
} = require("../../../schema/diagram_config_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  DiagramConfig,
  DiagramTopicConfig,
} = require("../domain/diagram_config");
const {
  DiagramConfigRepository,
} = require("../domain/diagram_config_repository");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function getTopicsCollectionPath(syllabusId) {
  return [
    DIAGRAM_CONFIGS_COLLECTION,
    syllabusId,
    DIAGRAM_CONFIG_TOPICS_SUBCOLLECTION,
  ].join("/");
}

function toDiagramTopicConfig(data) {
  return new DiagramTopicConfig({
    topicId: data.id,
    isDiagramApplicable: data.isDiagramApplicable,
    diagramQuestionPercentage:
      data.diagramQuestionPercentage ?? 0,
  });
}

function compareTopicConfigs(first, second) {
  return first.topicId.localeCompare(second.topicId);
}

class FirestoreDiagramConfigRepository
  extends DiagramConfigRepository {
  constructor({
    readCollection = firebaseOps.readCollection,
  } = {}) {
    super();
    this.readCollection = readCollection;
  }

  async getBySyllabusId(syllabusId) {
    const id = requireIdentifier(syllabusId, "syllabusId");
    const topicRecords = await this.readCollection(
      getTopicsCollectionPath(id),
    );
    const topics = topicRecords
      .map(toDiagramTopicConfig)
      .sort(compareTopicConfigs);

    return new DiagramConfig({
      syllabusId: id,
      topics,
    });
  }

  async list() {
    const configRecords = await this.readCollection(
      DIAGRAM_CONFIGS_COLLECTION,
    );
    const configs = await Promise.all(
      configRecords.map((record) =>
        this.getBySyllabusId(
          requireIdentifier(record.id, "syllabusId"),
        ),
      ),
    );

    return configs.sort((first, second) =>
      first.syllabusId.localeCompare(second.syllabusId),
    );
  }
}

module.exports = {
  FirestoreDiagramConfigRepository,
};
