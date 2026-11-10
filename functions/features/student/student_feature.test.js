const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FirestoreStudentRepository,
} = require("./infrastructure/firestore_student_repository");
const studentModule = require("./student_module");

test("student module retains reads and exposes profile and credential APIs", () => {
  for (const name of ["getStudentById", "getStudentProfile", "updateStudentProfile", "createStudentProfile", "listStudentProfiles",
    "changeStudentUsername", "resetStudentPin", "getStudentCredentialChange"]) assert.equal(typeof studentModule[name], "function");
});

test("student repository reads the stream-selection fields", async () => {
  const repository = new FirestoreStudentRepository({
    readDocument: async (collection, documentId) => {
      assert.equal(collection, "students");
      assert.equal(documentId, "student-1");

      return {
        email: "student@rhx.com",
        name: "Student One",
        username: "student1",
        pin: "123456",
        country: "Malaysia",
        level: "primary",
        yearOfRegistration: 2025,
        standardAtYearOfRegistration: "3",
      };
    },
  });

  const student = await repository.getById("student-1");

  assert.equal(student.id, "student-1");
  assert.equal(student.pin, undefined, "Profile models do not expose legacy credential copies");
  assert.equal(student.country, "Malaysia");
  assert.equal(student.level, "primary");
  assert.equal(student.yearOfRegistration, 2025);
  assert.equal(student.standardAtYearOfRegistration, "3");
});
