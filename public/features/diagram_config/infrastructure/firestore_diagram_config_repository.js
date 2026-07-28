import {
  DIAGRAM_CONFIGS_COLLECTION,
  DIAGRAM_CONFIG_TOPICS_SUBCOLLECTION
} from "../../../config/firebase/diagram_config_schema.js";
import {
  deleteDocument,
  readCollection,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";
import {
  DiagramConfig,
  DiagramTopicConfig
} from "../domain/diagram_config.js";
import {
  DiagramConfigRepository
} from "../domain/diagram_config_repository.js";

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
    requireIdentifier(syllabusId, "syllabusId"),
    DIAGRAM_CONFIG_TOPICS_SUBCOLLECTION
  ].join("/");
}

function toTopicConfig(data) {
  return new DiagramTopicConfig({
    topicId: data.id,
    isDiagramApplicable: data.isDiagramApplicable === true,
    diagramQuestionPercentage: data.diagramQuestionPercentage ?? 0
  });
}

function toTopicRecord(topic) {
  return {
    isDiagramApplicable: topic.isDiagramApplicable,
    diagramQuestionPercentage: topic.isDiagramApplicable
      ? topic.diagramQuestionPercentage
      : 0
  };
}

export class FirestoreDiagramConfigRepository
  extends DiagramConfigRepository {
  async getBySyllabusId(syllabusId) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId"
    );
    const topics = await readCollection(
      getTopicsCollectionPath(normalizedSyllabusId)
    );

    return new DiagramConfig({
      syllabusId: normalizedSyllabusId,
      topics: topics.map(toTopicConfig)
    });
  }

  async save(diagramConfig) {
    const config = diagramConfig instanceof DiagramConfig
      ? diagramConfig
      : new DiagramConfig(diagramConfig);
    const topicsPath = getTopicsCollectionPath(config.syllabusId);
    const existingTopics = await readCollection(topicsPath);
    const savedTopicIds = new Set(
      config.topics.map((topic) => topic.topicId)
    );

    await writeDocument(
      DIAGRAM_CONFIGS_COLLECTION,
      config.syllabusId,
      {},
      { merge: false }
    );

    for (const topic of config.topics) {
      await writeDocument(
        topicsPath,
        topic.topicId,
        toTopicRecord(topic),
        { merge: false }
      );
    }

    await Promise.all(
      existingTopics
        .filter((topic) => !savedTopicIds.has(topic.id))
        .map((topic) => deleteDocument(topicsPath, topic.id))
    );

    return config;
  }
}
