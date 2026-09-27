import assert from "node:assert/strict";
import test from "node:test";

import {
  pauseCoreDailyMission
} from "./daily_mission_module.js";
import {
  FirebaseCallableDailyMissionGateway
} from "./infrastructure/firebase_callable_daily_mission_gateway.js";

test("daily mission module exposes core mission pausing", () => {
  assert.equal(typeof pauseCoreDailyMission, "function");
});

test("Firebase gateway calls pauseCoreDailyMission", async () => {
  const calls = [];
  const expected = {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    practiceId: "practice-1",
    pausedDate: "2026-09-27",
    isPaused: true,
    created: true
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
  const input = {
    studentId: "student-1",
    practiceId: "practice-1"
  };

  assert.deepEqual(await gateway.pauseCoreDailyMission(input), expected);
  assert.deepEqual(calls, [{
    functionName: "pauseCoreDailyMission",
    data: input
  }]);
});
