export const DIAGRAM_CONFIGS_COLLECTION = "diagramConfigs";
export const DIAGRAM_CONFIG_TOPICS_SUBCOLLECTION = "topics";

export const diagramConfigDocumentIdPattern = "[syllabus_id]";
export const diagramConfigTopicDocumentIdPattern = "[topic_id]";

export const diagramConfigSchema = {
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

export default {
  DIAGRAM_CONFIGS_COLLECTION,
  DIAGRAM_CONFIG_TOPICS_SUBCOLLECTION,
  diagramConfigDocumentIdPattern,
  diagramConfigTopicDocumentIdPattern,
  diagramConfigSchema
};
