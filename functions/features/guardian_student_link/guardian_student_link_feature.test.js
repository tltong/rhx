const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GetGuardianStudentLink,
} = require("./application/get_guardian_student_link");
const {
  GuardianStudentLink,
} = require("./domain/guardian_student_link");
const {
  buildGuardianStudentLinkDocumentId,
  FirestoreGuardianStudentLinkRepository,
} = require(
  "./infrastructure/firestore_guardian_student_link_repository"
);

test("builds the same guardian-student document ID as the web feature", () => {
  assert.equal(
    buildGuardianStudentLinkDocumentId("guardian/1", "student 1"),
    "guardian%2F1__student%201",
  );
});

test("reads and validates an active guardian-student link", async () => {
  const calls = [];
  const repository = new FirestoreGuardianStudentLinkRepository({
    async readDocument(collection, documentId) {
      calls.push({collection, documentId});
      return {
        id: documentId,
        guardianId: "guardian-123",
        studentId: "student-123",
        relationship: "parent",
        state: "active",
        linkedAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      };
    },
  });
  const useCase = new GetGuardianStudentLink(repository);
  const link = await useCase.execute({
    guardianId: "guardian-123",
    studentId: "student-123",
  });

  assert.equal(link instanceof GuardianStudentLink, true);
  assert.equal(link.isActive, true);
  assert.deepEqual(calls, [{
    collection: "guardianStudentLinks",
    documentId: "guardian-123__student-123",
  }]);
});
