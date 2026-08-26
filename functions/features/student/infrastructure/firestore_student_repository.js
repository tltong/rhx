const {
  STUDENTS_COLLECTION,
} = require("../../../schema/student_schema");
const firebaseOps = require("../../../utils/firebase/firebase_ops");
const {
  Student,
} = require("../domain/student");
const {
  StudentRepository,
} = require("../domain/student_repository");

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

class FirestoreStudentRepository extends StudentRepository {
  constructor({readDocument = firebaseOps.readDocument} = {}) {
    super();
    this.readDocument = readDocument;
  }

  async getById(studentId) {
    const id = requireIdentifier(studentId, "studentId");
    const data = await this.readDocument(STUDENTS_COLLECTION, id);

    if (!data) {
      return null;
    }

    return new Student({
      id,
      email: data.email,
      name: data.name,
      username: data.username,
      pin: data.pin,
      country: data.country,
      level: data.level,
      yearOfBirth: data.yearOfBirth,
      yearOfRegistration: data.yearOfRegistration,
      registrationDate: data.registrationDate,
      standardAtYearOfRegistration: data.standardAtYearOfRegistration,
    });
  }
}

module.exports = {
  FirestoreStudentRepository,
};
