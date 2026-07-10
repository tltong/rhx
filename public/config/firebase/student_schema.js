export const STUDENTS_COLLECTION = "students";

export const studentSchema = {
  authUid: "string",
  email: "string",
  name: "string",
  username: "string",
  yearOfBirth: "number",
  yearOfRegistration: "number",
  registrationDate: "timestamp",
  standardAtYearOfRegistration: "string"
};

export default {
  STUDENTS_COLLECTION,
  studentSchema
};
