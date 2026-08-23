export const STREAMS_COLLECTION = "streams";
export const STREAM_YEARS_SUBCOLLECTION = "years";

export const streamDocumentIdPattern = "[auto_generated_id]";
export const streamYearDocumentIdPattern = "[year_number]";
export const streamSyllabusIdPattern = "[syllabus_id]";

export const streamSchema = {
  collection: STREAMS_COLLECTION,
  documentId: streamDocumentIdPattern,
  fields: {
    name: "string",
    country: "string",
    level: "string",
    createdAt: "timestamp",
    updatedAt: "timestamp"
  },
  subcollections: {
    years: {
      collection: STREAM_YEARS_SUBCOLLECTION,
      documentId: streamYearDocumentIdPattern,
      fields: {
        year: "number",
        syllabuses: {
          type: "map",
          entries: {
            [streamSyllabusIdPattern]: {
              type: "map",
              fields: {
                language: "string"
              }
            }
          }
        }
      }
    }
  }
};

export default {
  STREAMS_COLLECTION,
  STREAM_YEARS_SUBCOLLECTION,
  streamDocumentIdPattern,
  streamYearDocumentIdPattern,
  streamSyllabusIdPattern,
  streamSchema
};
