import assert from "node:assert/strict";
import test from "node:test";

import {
  SubscribeStudentToStreamSyllabuses
} from "./subscribe_student_to_stream_syllabuses.js";

function createUseCase(overrides = {}) {
  const calls = [];
  const useCase = new SubscribeStudentToStreamSyllabuses({
    getStudentAcademicScope: async () => ({
      studentId: "student-1",
      country: "Malaysia",
      level: "primary",
      year: 4
    }),
    getStreamById: async () => ({
      id: "stream-1",
      country: "Malaysia",
      level: "primary",
      getYearAssignment: (year) => year === 4 ? {
        syllabuses: [
          { syllabusId: "math-4", language: "English" },
          { syllabusId: "science-4", language: "Chinese" }
        ]
      } : null
    }),
    subscribeStudentToStream: async (studentId, streamId) => ({
      studentId,
      streamId
    }),
    subscribeSyllabus: async (studentId, syllabusId, language) => {
      calls.push({ studentId, syllabusId, language });
      return { studentId, syllabusId, language };
    },
    ...overrides
  });

  return { calls, useCase };
}

test("subscribes the student's stream year syllabuses with their languages", async () => {
  const { calls, useCase } = createUseCase();
  const result = await useCase.execute(" student-1 ", " stream-1 ");

  assert.equal(result.year, 4);
  assert.deepEqual(calls, [
    {
      studentId: "student-1",
      syllabusId: "math-4",
      language: "English"
    },
    {
      studentId: "student-1",
      syllabusId: "science-4",
      language: "Chinese"
    }
  ]);
  assert.equal(result.syllabusSubscriptions.length, 2);
});

test("rejects a stream outside the student's academic scope", async () => {
  let streamSubscribed = false;
  const { useCase } = createUseCase({
    getStreamById: async () => ({
      id: "stream-1",
      country: "Singapore",
      level: "primary",
      getYearAssignment: () => null
    }),
    subscribeStudentToStream: async () => {
      streamSubscribed = true;
    }
  });

  await assert.rejects(
    () => useCase.execute("student-1", "stream-1"),
    /scopes do not match/
  );
  assert.equal(streamSubscribed, false);
});

test("allows a stream year with no syllabus assignments", async () => {
  const { calls, useCase } = createUseCase({
    getStreamById: async () => ({
      id: "stream-1",
      country: "Malaysia",
      level: "primary",
      getYearAssignment: () => null
    })
  });
  const result = await useCase.execute("student-1", "stream-1");

  assert.deepEqual(calls, []);
  assert.deepEqual(result.syllabusSubscriptions, []);
});
