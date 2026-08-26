import { Student } from "../domain/student.js?v=20260825-student-pin-v1";
import { StudentRepository } from "../domain/student_repository.js?v=20260716-no-eager-auth";
import {
  STUDENTS_COLLECTION,
  studentLevels
} from "../../../config/firebase/student_schema.js?v=20260825-student-pin-v1";
import {
  deleteDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";

const PIN_PATTERN = /^\d{6}$/;
const STUDENT_LEVEL_VALUES = new Set(Object.values(studentLevels));

function normalizeStudentLevel(level) {
  const normalizedLevel = String(level || "").trim().toLowerCase();

  if (!STUDENT_LEVEL_VALUES.has(normalizedLevel)) {
    throw new Error(`level must be one of: ${Object.values(studentLevels).join(", ")}.`);
  }

  return normalizedLevel;
}

function normalizeCountry(country) {
  const normalizedCountry = String(country ?? "").trim();

  if (!normalizedCountry) {
    throw new Error("country is required.");
  }

  return normalizedCountry;
}

function normalizePin(pin) {
  const normalizedPin = String(pin ?? "").trim();

  if (!PIN_PATTERN.test(normalizedPin)) {
    throw new Error("pin must be exactly 6 digits.");
  }

  return normalizedPin;
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
    pin: data.pin,
    country: data.country,
    level: data.level,
    yearOfBirth: data.yearOfBirth,
    yearOfRegistration: data.yearOfRegistration,
    registrationDate: data.registrationDate,
    standardAtYearOfRegistration: data.standardAtYearOfRegistration
  });
}

function toStudentRecord(student) {
  const record = {
    email: student.email,
    name: student.name,
    username: student.username,
    level: normalizeStudentLevel(student.level),
    yearOfBirth: student.yearOfBirth,
    yearOfRegistration: student.yearOfRegistration,
    registrationDate: student.registrationDate,
    standardAtYearOfRegistration: student.standardAtYearOfRegistration
  };

  if (student.pin !== undefined && student.pin !== null) {
    record.pin = normalizePin(student.pin);
  }

  if (student.country !== undefined && student.country !== null) {
    record.country = normalizeCountry(student.country);
  }

  return record;
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

  async list() {
    const students = await readCollection(STUDENTS_COLLECTION);

    return students
      .map(toStudent)
      .filter(Boolean)
      .sort((first, second) => {
        const firstName = first.name || first.username || first.id;
        const secondName = second.name || second.username || second.id;

        return firstName.localeCompare(secondName);
      });
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
