export const STUDENTS_COLLECTION = "students";

export const studentLevels = {
  PRIMARY: "primary",
  SECONDARY: "secondary"
};

export const studentSchema = {
  email: "string",
  name: "string",
  username: "string",
  country: "string",
  level: {
    type: "string",
    enum: Object.values(studentLevels)
  },
  yearOfBirth: "number",
  yearOfRegistration: "number",
  registrationDate: "timestamp",
  standardAtYearOfRegistration: "string",
  schoolId: "string|null", profileVersion: "integer (legacy default 0)",
  academicReferenceYear: "optional integer", gradeAtReferenceYear: "optional integer",
  updatedAt: "timestamp", updatedBy: "uid"
};

export default {
  STUDENTS_COLLECTION,
  studentLevels,
  studentSchema
};
