import assert from "node:assert/strict";
import test from "node:test";

import {
  listAdditionalMissionPracticeIds
} from "./daily_mission_module.js";
import {
  FirebaseCallableDailyMissionGateway
} from "./infrastructure/firebase_callable_daily_mission_gateway.js";

test("daily mission module exposes additional mission practice IDs", () => {
  assert.equal(typeof listAdditionalMissionPracticeIds, "function");
});

test("Firebase gateway calls listAdditionalMissionPracticeIds", async () => {
  const calls = [];
  const gateway = new FirebaseCallableDailyMissionGateway({
    getApp() {
      return {
        functions(region) {
          assert.equal(region, "us-central1");

          return {
            httpsCallable(functionName) {
              return async (data) => {
                calls.push({functionName, data});
                return {data: ["practice-1", "practice-2"]};
              };
            }
          };
        }
      };
    }
  });
  const input = {
    studentId: "student-1",
    syllabusId: "syllabus-1"
  };

  assert.deepEqual(
    await gateway.listAdditionalMissionPracticeIds(input),
    ["practice-1", "practice-2"]
  );
  assert.deepEqual(calls, [{
    functionName: "listAdditionalMissionPracticeIds",
    data: input
  }]);
});
