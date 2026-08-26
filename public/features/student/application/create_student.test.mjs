import assert from "node:assert/strict";
import test from "node:test";

import { CreateStudent } from "./create_student.js";

test("student creation retains the supplied PIN for persistence", async () => {
  let savedStudent = null;
  const useCase = new CreateStudent({
    studentRepository: {
      save: async (student) => {
        savedStudent = student;
      }
    },
    findSyllabusScopeByCountry: async () => ({ country: "Malaysia" })
  });

  const student = await useCase.execute({
    id: "student-1",
    username: "student1",
    pin: "123456",
    country: "Malaysia"
  });

  assert.equal(student.pin, "123456");
  assert.equal(savedStudent.pin, "123456");
});
