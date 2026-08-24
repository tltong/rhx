import assert from "node:assert/strict";
import test from "node:test";

import {
  ListLinkedStudentsForGuardian
} from "./list_linked_students_for_guardian.js";

test("linked student listing hydrates active links through the student API", async () => {
  const requestedStudentIds = [];
  const useCase = new ListLinkedStudentsForGuardian({
    guardianStudentLinkRepository: {
      listByGuardian: async () => [
        { studentId: "student-1", state: "active", relationship: "parent" },
        { studentId: "student-2", state: "inactive", relationship: "teacher" }
      ]
    },
    getStudentSummaryById: async (studentId) => {
      requestedStudentIds.push(studentId);
      return { id: studentId, name: "Student One", grade: 4 };
    }
  });

  const linkedStudents = await useCase.execute("guardian-1");

  assert.equal(linkedStudents.length, 1);
  assert.equal(linkedStudents[0].student.id, "student-1");
  assert.deepEqual(requestedStudentIds, ["student-1"]);
});
