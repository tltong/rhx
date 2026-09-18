const GUARDIAN_STUDENT_LINKS_COLLECTION = "guardianStudentLinks";

const guardianStudentLinkStates = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
});

const guardianStudentRelationships = Object.freeze({
  PARENT: "parent",
  TEACHER: "teacher",
  GUARDIAN: "guardian",
});

const guardianStudentLinkSchema = {
  collection: GUARDIAN_STUDENT_LINKS_COLLECTION,
  documentId: "[encoded_guardian_id]__[encoded_student_id]",
  fields: {
    guardianId: "string",
    studentId: "string",
    relationship: {
      type: "string",
      enum: Object.values(guardianStudentRelationships),
    },
    state: {
      type: "string",
      enum: Object.values(guardianStudentLinkStates),
    },
    linkedAt: "timestamp",
    updatedAt: "timestamp",
  },
};

module.exports = {
  GUARDIAN_STUDENT_LINKS_COLLECTION,
  guardianStudentLinkSchema,
  guardianStudentLinkStates,
  guardianStudentRelationships,
};
