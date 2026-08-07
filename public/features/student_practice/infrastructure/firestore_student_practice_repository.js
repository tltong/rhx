import {
  ASSIGNED_PRACTICES_SUBCOLLECTION,
  STUDENT_PRACTICES_COLLECTION
} from "../../../config/firebase/student_practice_schema.js";
import {
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";
import {
  StudentPracticeAssignment
} from "../domain/student_practice_assignment.js?v=20260807-student-practice";
import {
  StudentPracticeRepository
} from "../domain/student_practice_repository.js";

function assignedPracticesCollectionPath(studentId) {
  return [
    STUDENT_PRACTICES_COLLECTION,
    studentId,
    ASSIGNED_PRACTICES_SUBCOLLECTION
  ].join("/");
}

export class FirestoreStudentPracticeRepository
  extends StudentPracticeRepository {
  async assign(assignment) {
    const normalizedAssignment = assignment instanceof StudentPracticeAssignment
      ? assignment
      : new StudentPracticeAssignment(assignment);

    await writeDocument(
      STUDENT_PRACTICES_COLLECTION,
      normalizedAssignment.studentId,
      {},
      { merge: true }
    );
    await writeDocument(
      assignedPracticesCollectionPath(normalizedAssignment.studentId),
      normalizedAssignment.practiceId,
      {},
      { merge: false }
    );

    return normalizedAssignment;
  }
}
