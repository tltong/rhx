import assert from "node:assert/strict";
import test from "node:test";

import { GetStudentAcademicScope } from "./get_student_academic_scope.js";

test("returns the student's current country, level, and school year", async () => {
  const useCase = new GetStudentAcademicScope(
    {
      getById: async () => ({
        id: "student-1",
        country: "Malaysia",
        level: "Primary",
        yearOfRegistration: 2025,
        standardAtYearOfRegistration: 3
      })
    },
    () => new Date("2026-08-25T00:00:00.000Z")
  );

  assert.deepEqual(await useCase.execute("student-1"), {
    studentId: "student-1",
    country: "Malaysia",
    level: "primary",
    year: 4
  });
});

test("returns null when the student does not exist", async () => {
  const useCase = new GetStudentAcademicScope({
    getById: async () => null
  });

  assert.equal(await useCase.execute("missing-student"), null);
});
