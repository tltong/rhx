import { Student } from "../domain/student.js?v=20260714-level";
import { StudentRepository } from "../domain/student_repository.js?v=20260714-level";
import {
  STUDENTS_COLLECTION,
  studentLevels
} from "../../../config/firebase/student_schema.js?v=20260715-student-levels";
import {
  deleteDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";

const STUDENT_LEVEL_VALUES = new Set(Object.values(studentLevels));

function normalizeStudentLevel(level) {
  const normalizedLevel = String(level || "").trim().toLowerCase();

  if (!STUDENT_LEVEL_VALUES.has(normalizedLevel)) {
    throw new Error(`level must be one of: ${Object.values(studentLevels).join(", ")}.`);
  }

  return normalizedLevel;
}

function toStudent(data) {
  if (!data) {
    return null;
  }

  return new Student({
    id: data.id,
    email: data.email,
    name: data.name,
    username: data.username,
    level: data.level,
    yearOfBirth: data.yearOfBirth,
    yearOfRegistration: data.yearOfRegistration,
    registrationDate: data.registrationDate,
    standardAtYearOfRegistration: data.standardAtYearOfRegistration
  });
}

function toStudentRecord(student) {
  return {
    email: student.email,
    name: student.name,
    username: student.username,
    level: normalizeStudentLevel(student.level),
    yearOfBirth: student.yearOfBirth,
    yearOfRegistration: student.yearOfRegistration,
    registrationDate: student.registrationDate,
    standardAtYearOfRegistration: student.standardAtYearOfRegistration
  };
}

export class FirestoreStudentRepository extends StudentRepository {
  async getById(studentId) {
    const data = await readDocument(STUDENTS_COLLECTION, studentId);

    return toStudent(data);
  }

  async findByUsername(username) {
    const students = await readCollection(
      STUDENTS_COLLECTION,
      (collection) => collection.where("username", "==", username).limit(1)
    );

    return toStudent(students[0] || null);
  }

  async save(student) {
    await writeDocument(
      STUDENTS_COLLECTION,
      student.id,
      toStudentRecord(student),
      { merge: true }
    );

    return student;
  }

  async delete(studentId) {
    await deleteDocument(STUDENTS_COLLECTION, studentId);
  }
}
