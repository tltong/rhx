import assert from "node:assert/strict";
import test from "node:test";

import {
  GuardianStudentLink,
  guardianStudentLinkStates,
  guardianStudentRelationships
} from "./domain/guardian_student_link.js";
import {
  LinkStudentToGuardian
} from "./application/link_student_to_guardian.js";
import {
  UpdateGuardianStudentLink
} from "./application/update_guardian_student_link.js";

class MemoryLinkRepository {
  constructor() {
    this.links = new Map();
  }

  key(guardianId, studentId) {
    return `${guardianId}:${studentId}`;
  }

  async get(guardianId, studentId) {
    return this.links.get(this.key(guardianId, studentId)) || null;
  }

  async save(link) {
    this.links.set(this.key(link.guardianId, link.studentId), link);
    return link;
  }
}

test("guardian-student enums are owned and enforced by the domain class", () => {
  assert.deepEqual(Object.values(guardianStudentRelationships), [
    "parent",
    "teacher",
    "guardian"
  ]);
  assert.deepEqual(Object.values(guardianStudentLinkStates), ["active", "inactive"]);
  assert.throws(() => new GuardianStudentLink({
    guardianId: "guardian-1",
    studentId: "student-1",
    relationship: "friend"
  }), /relationship must be one of/);
});

test("linking validates both profiles and creates an active link", async () => {
  const repository = new MemoryLinkRepository();
  const linkedAt = new Date("2026-08-25T00:00:00.000Z");
  const useCase = new LinkStudentToGuardian({
    guardianStudentLinkRepository: repository,
    getGuardianById: async (id) => id === "guardian-1" ? { id } : null,
    getStudentById: async (id) => id === "student-1" ? { id } : null,
    now: () => linkedAt
  });

  const link = await useCase.execute({
    guardianId: "guardian-1",
    studentId: "student-1",
    relationship: "parent"
  });

  assert.equal(link.state, "active");
  assert.equal(link.relationship, "parent");
  assert.equal(link.linkedAt, linkedAt);
});

test("linking again updates and reactivates the existing link", async () => {
  const repository = new MemoryLinkRepository();
  const originalDate = new Date("2026-08-20T00:00:00.000Z");
  const updatedDate = new Date("2026-08-25T00:00:00.000Z");
  const existingLink = new GuardianStudentLink({
    guardianId: "guardian-1",
    studentId: "student-1",
    relationship: "guardian",
    state: "inactive",
    linkedAt: originalDate,
    updatedAt: originalDate
  });
  await repository.save(existingLink);

  const useCase = new LinkStudentToGuardian({
    guardianStudentLinkRepository: repository,
    getGuardianById: async () => ({ id: "guardian-1" }),
    getStudentById: async () => ({ id: "student-1" }),
    now: () => updatedDate
  });
  const link = await useCase.execute({
    guardianId: "guardian-1",
    studentId: "student-1",
    relationship: "teacher"
  });

  assert.equal(link.state, "active");
  assert.equal(link.relationship, "teacher");
  assert.equal(link.linkedAt, originalDate);
  assert.equal(link.updatedAt, updatedDate);
});

test("relationship and state updates require an existing link", async () => {
  const useCase = new UpdateGuardianStudentLink(new MemoryLinkRepository());

  await assert.rejects(
    useCase.activate({ guardianId: "guardian-1", studentId: "student-1" }),
    (error) => error.code === "guardian-student-link/not-found"
  );
});
