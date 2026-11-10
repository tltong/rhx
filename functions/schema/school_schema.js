const SCHOOL_STATES_COLLECTION = "schoolStates";
const SCHOOL_LOCALITIES_COLLECTION = "schoolLocalities";
const SCHOOLS_COLLECTION = "schools";
const common = {name: "string", nameNormalized: "string", country: "string", status: "active|archived", version: "positive integer",
  createdAt: "timestamp", updatedAt: "timestamp", createdBy: "uid", updatedBy: "uid"};
const schoolStateSchema = {collection: SCHOOL_STATES_COLLECTION, documentId: "[generated_id]", fields: {...common}};
const schoolLocalitySchema = {collection: SCHOOL_LOCALITIES_COLLECTION, documentId: "[generated_id]", fields: {...common, stateId: "string", type: "city|town"}};
const schoolSchema = {collection: SCHOOLS_COLLECTION, documentId: "[generated_id]", fields: {...common,
  level: "primary|secondary", stateId: "string", localityId: "string", streamId: "string|null", schoolCode: "string (optional official code)",
  searchPrefixes: "string[] (server-generated word prefixes)"}};
module.exports = {SCHOOL_STATES_COLLECTION, SCHOOL_LOCALITIES_COLLECTION, SCHOOLS_COLLECTION, schoolStateSchema, schoolLocalitySchema, schoolSchema};
