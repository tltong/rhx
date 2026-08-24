import {
  guardianStudentLinkStates,
  guardianStudentRelationships
} from "../../features/guardian_student_link/domain/guardian_student_link.js";

export const GUARDIAN_STUDENT_LINKS_COLLECTION = "guardianStudentLinks";

export const guardianStudentLinkSchema = {
  guardianId: "string",
  studentId: "string",
  relationship: {
    type: "string",
    enum: Object.values(guardianStudentRelationships)
  },
  state: {
    type: "string",
    enum: Object.values(guardianStudentLinkStates)
  },
  linkedAt: "timestamp",
  updatedAt: "timestamp"
};

export default {
  GUARDIAN_STUDENT_LINKS_COLLECTION,
  guardianStudentLinkSchema
};
