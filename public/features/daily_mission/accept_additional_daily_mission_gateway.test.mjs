import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptAdditionalDailyMission
} from "./daily_mission_module.js";
import {
  FirebaseCallableDailyMissionGateway
} from "./infrastructure/firebase_callable_daily_mission_gateway.js";

test("daily mission module exposes additional mission acceptance", () => {
  assert.equal(typeof acceptAdditionalDailyMission, "function");
});

test("Firebase gateway calls acceptAdditionalDailyMission", async () => {
  const calls = [];
  const expected = {
    studentId: "student-1",
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    practiceId: "practice-1",
    date: "2026-09-27",
    isAccepted: true,
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

  assert.deepEqual(
    await gateway.acceptAdditionalDailyMission(input),
    expected
  );
  assert.deepEqual(calls, [{
    functionName: "acceptAdditionalDailyMission",
    data: input
  }]);
});
