import assert from "node:assert/strict";
import test from "node:test";

import { SearchStudents } from "./search_students.js";

const students = [
  {
    id: "student-1",
    name: "Aisha Lee",
    yearOfBirth: 2016,
    level: "primary",
    yearOfRegistration: 2025,
    standardAtYearOfRegistration: "3"
  },
  {
    id: "student-2",
    name: "Aisha Lee",
    yearOfBirth: 2015,
    level: "primary",
    yearOfRegistration: 2025,
    standardAtYearOfRegistration: "3"
  }
];

test("student search requires all identity fields to match", async () => {
  const useCase = new SearchStudents(
    { list: async () => students },
    () => new Date("2026-08-25T00:00:00.000Z")
  );

  const matches = await useCase.execute({
    name: "  AISHA   LEE ",
    yearOfBirth: 2016,
    level: "primary",
    grade: 4
  });

  assert.deepEqual(matches, [{
    id: "student-1",
    name: "Aisha Lee",
    yearOfBirth: 2016,
    level: "primary",
    grade: 4
  }]);
});

test("student search rejects an incomplete grade", async () => {
  const useCase = new SearchStudents(
    { list: async () => students },
    () => new Date("2026-08-25T00:00:00.000Z")
  );

  await assert.rejects(
    useCase.execute({
      name: "Aisha Lee",
      yearOfBirth: 2016,
      level: "primary",
      grade: ""
    }),
    /grade must be between 1 and 6/
  );
});
