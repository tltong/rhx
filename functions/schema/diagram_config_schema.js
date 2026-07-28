const DIAGRAM_CONFIGS_COLLECTION = "diagramConfigs";
const DIAGRAM_CONFIG_TOPICS_SUBCOLLECTION = "topics";

const diagramConfigDocumentIdPattern = "[syllabus_id]";
const diagramConfigTopicDocumentIdPattern = "[topic_id]";

const diagramConfigSchema = {
  collection: DIAGRAM_CONFIGS_COLLECTION,
  documentId: diagramConfigDocumentIdPattern,
  subcollections: {
    topics: {
      collection: DIAGRAM_CONFIG_TOPICS_SUBCOLLECTION,
      documentId: diagramConfigTopicDocumentIdPattern,
      fields: {
        isDiagramApplicable: {
          type: "boolean",
          default: false
        },
        diagramQuestionPercentage: {
          type: "number",
          minimum: 0,
          maximum: 100,
          default: 0
        }
      }
    }
  }
};

module.exports = {
  DIAGRAM_CONFIGS_COLLECTION,
  DIAGRAM_CONFIG_TOPICS_SUBCOLLECTION,
  diagramConfigDocumentIdPattern,
  diagramConfigTopicDocumentIdPattern,
  diagramConfigSchema
};
