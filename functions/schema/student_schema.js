const STUDENTS_COLLECTION = "students";

const studentLevels = {
  PRIMARY: "primary",
  SECONDARY: "secondary"
};

const studentSchema = {
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

module.exports = {
  STUDENTS_COLLECTION,
  studentLevels,
  studentSchema
};
