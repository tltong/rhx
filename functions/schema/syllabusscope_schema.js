const SYLLABUS_SCOPE_COLLECTION = "syllabusScope";

const syllabusScopeDocumentIdPattern = "[country_name]";
const syllabusScopeLevelTypes = Object.freeze([
  "primary",
  "secondary"
]);
const syllabusScopeGradeNumbers = Object.freeze([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6"
]);
const syllabusScopeGradeIdPattern = "[grade_number]";

const syllabusScopeSchema = {
  collection: SYLLABUS_SCOPE_COLLECTION,
  documentId: syllabusScopeDocumentIdPattern,
  fields: {
    country: "string",
    languages: {
      type: "array",
      items: "string"
    },
    levels: {
      type: "map",
      allowedKeys: syllabusScopeLevelTypes,
      entries: {
        "[level_type]": {
          type: "map",
          allowedKeys: syllabusScopeGradeNumbers,
          entries: {
            [syllabusScopeGradeIdPattern]: "boolean"
          }
        }
      }
    }
  }
};

module.exports = {
  SYLLABUS_SCOPE_COLLECTION,
  syllabusScopeDocumentIdPattern,
  syllabusScopeLevelTypes,
  syllabusScopeGradeNumbers,
  syllabusScopeGradeIdPattern,
  syllabusScopeSchema
};
