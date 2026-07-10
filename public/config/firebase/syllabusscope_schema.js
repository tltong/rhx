export const SYLLABUS_SCOPE_COLLECTION = "syllabusScope";

export const syllabusScopeDocumentIdPattern = "[country_name]";
export const syllabusScopeLevelTypes = Object.freeze([
  "primary",
  "secondary"
]);
export const syllabusScopeGradeNumbers = Object.freeze([
  "1",
  "2",
  "3",
  "4",
  "5",
  "6"
]);
export const syllabusScopeGradeIdPattern = "[grade_number]";

export const syllabusScopeSchema = {
  collection: SYLLABUS_SCOPE_COLLECTION,
  documentId: syllabusScopeDocumentIdPattern,
  fields: {
    country: "string",
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

export default {
  SYLLABUS_SCOPE_COLLECTION,
  syllabusScopeDocumentIdPattern,
  syllabusScopeLevelTypes,
  syllabusScopeGradeNumbers,
  syllabusScopeGradeIdPattern,
  syllabusScopeSchema
};
