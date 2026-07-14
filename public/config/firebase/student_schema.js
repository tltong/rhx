export const STUDENTS_COLLECTION = "students";

export const studentLevels = {
  PRIMARY: "primary",
  SECONDARY: "secondary"
};

export const studentSchema = {
  email: "string",
  name: "string",
  username: "string",
  level: {
    type: "string",
    enum: Object.values(studentLevels)
  },
  yearOfBirth: "number",
  yearOfRegistration: "number",
  registrationDate: "timestamp",
  standardAtYearOfRegistration: "string"
};

export default {
  STUDENTS_COLLECTION,
  studentLevels,
  studentSchema
};
