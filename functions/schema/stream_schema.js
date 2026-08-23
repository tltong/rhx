const STREAMS_COLLECTION = "streams";
const STREAM_YEARS_SUBCOLLECTION = "years";

const streamDocumentIdPattern = "[auto_generated_id]";
const streamYearDocumentIdPattern = "[year_number]";
const streamSyllabusIdPattern = "[syllabus_id]";

const streamSchema = {
  collection: STREAMS_COLLECTION,
  documentId: streamDocumentIdPattern,
  fields: {
    name: "string",
    country: "string",
    level: "string",
    createdAt: "timestamp",
    updatedAt: "timestamp",
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
                language: "string",
              },
            },
          },
        },
      },
    },
  },
};

module.exports = {
  STREAMS_COLLECTION,
  STREAM_YEARS_SUBCOLLECTION,
  streamDocumentIdPattern,
  streamYearDocumentIdPattern,
  streamSyllabusIdPattern,
  streamSchema,
};
