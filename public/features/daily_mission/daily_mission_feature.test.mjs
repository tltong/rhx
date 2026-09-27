import assert from "node:assert/strict";
import test from "node:test";

import {
  GetNextCoreDailyMission
} from "./application/get_next_core_daily_mission.js";
import {
  FirebaseCallableDailyMissionGateway
} from "./infrastructure/firebase_callable_daily_mission_gateway.js";
import {
  getNextCoreDailyMission
} from "./daily_mission_module.js";

test("daily mission module exposes the core mission lookup", () => {
  assert.equal(typeof getNextCoreDailyMission, "function");
});

test("web use case validates and freezes the daily mission response", async () => {
  const calls = [];
  const useCase = new GetNextCoreDailyMission({
    async getNextCoreDailyMission(input) {
      calls.push(input);
      return {
        studentId: "student-1",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        practiceId: "practice-1",
        date: "2026-09-27",
        isAccepted: false
      };
    }
  });
  const result = await useCase.execute({
    studentId: " student-1 ",
    syllabusId: " syllabus-1 "
  });

  assert.deepEqual(calls, [{
    studentId: "student-1",
    syllabusId: "syllabus-1"
  }]);
  assert.deepEqual(result, {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    practiceId: "practice-1",
    date: "2026-09-27",
    isAccepted: false
  });
  assert.equal(Object.isFrozen(result), true);
});

test("web use case allows an empty daily mission result", async () => {
  const useCase = new GetNextCoreDailyMission({
    async getNextCoreDailyMission() {
      return null;
    }
  });

  assert.equal(await useCase.execute({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  }), null);
});

test("web use case rejects a mission for another student", async () => {
  const useCase = new GetNextCoreDailyMission({
    async getNextCoreDailyMission() {
      return {
        studentId: "student-2",
        syllabusId: "syllabus-1",
        topicId: "topic-1",
        practiceId: "practice-1",
        date: "2026-09-27",
        isAccepted: false
      };
    }
  });

  await assert.rejects(
    () => useCase.execute({
      studentId: "student-1",
      syllabusId: "syllabus-1"
    }),
    /unexpected studentId/
  );
});

test("Firebase gateway calls the core daily mission function", async () => {
  const calls = [];
  const expected = {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    practiceId: "practice-1",
    date: "2026-09-27",
    isAccepted: false
  };
  const gateway = new FirebaseCallableDailyMissionGateway({
    getApp() {
      return {
        functions(region) {
          assert.equal(region, "us-central1");

          return {
            httpsCallable(functionName) {
              return async (data) => {
                calls.push({functionName, data});
                return {data: expected};
              };
            }
          };
        }
      };
    }
  });

  assert.deepEqual(await gateway.getNextCoreDailyMission({
    studentId: "student-1",
    syllabusId: "syllabus-1"
  }), expected);
  assert.deepEqual(calls, [{
    functionName: "getNextCoreDailyMission",
    data: {
      studentId: "student-1",
      syllabusId: "syllabus-1"
    }
  }]);
});
