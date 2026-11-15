const NEWS_CONFIG_COLLECTION = "newsConfig";
const NEWS_CONFIG_DOCUMENT_ID = "settings";
const newsConfigSchema = {
  collection: NEWS_CONFIG_COLLECTION, documentId: NEWS_CONFIG_DOCUMENT_ID,
  fields: {kind: "settings", schemaVersion: 1, version: "nonnegative safe integer; aggregate revision",
    discoveryInstructions: "string", additionalLlmInstructions: "string",
    defaultTargetWordCounts: {standardArticle: "integer 1..10000; default 400", multiPageArticle: "integer 1..10000; default 400", pictureStory: "integer 0..10000; default 50"},
    defaultMultiPageCount: "integer 1..20; default 4", updatedAt: "timestamp", updatedBy: "administrator UID"},
};
const newsArticleTypeConfigSchema = {
  collection: NEWS_CONFIG_COLLECTION, documentId: "type_{standardArticle|multiPageArticle|pictureStory}",
  fields: {kind: "articleType", articleTypeId: "standardArticle|multiPageArticle|pictureStory",
    photoCount: "integer 0..12; pictureStory requires 1..12", photoType: "web|ai; web retries once then uses an entirely AI image set",
    version: "positive safe integer", updatedAt: "timestamp", updatedBy: "administrator UID"},
};
const newsGradeConfigSchema = {
  collection: NEWS_CONFIG_COLLECTION, documentId: "grade_{primary|secondary}_{1..6}",
  fields: {kind: "grade", level: "primary|secondary", standard: "integer 1..6", articleTypeId: "one configured built-in format",
    additionalLlmInstructions: "string", targetWordCount: "integer 1..10000|null; pictureStory also accepts 0; null inherits defaults",
    pageCount: "integer 1..20|null for multiPageArticle; otherwise null; pictureStory pages equal photoCount",
    questionAnswerMode: "typed|word_bank; defaults primary 1-4:word_bank, other grades:typed; frozen per assignment/preview",
    vocabularyCount: "integer 0..50; defaults primary 1-2:3, 3-4:5, 5-6:8, secondary:10; zero disables",
    version: "positive safe integer", updatedAt: "timestamp", updatedBy: "administrator UID"},
};
export {NEWS_CONFIG_COLLECTION, NEWS_CONFIG_DOCUMENT_ID, newsConfigSchema, newsArticleTypeConfigSchema, newsGradeConfigSchema};
