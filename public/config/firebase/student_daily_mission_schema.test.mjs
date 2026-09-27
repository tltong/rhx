import assert from "node:assert/strict";
import test from "node:test";

import {
  studentDailyMissionSchema
} from "./student_daily_mission_schema.js";

test("web schema defines the core mission transaction reference", () => {
  const syllabusFields = studentDailyMissionSchema
    .subcollections.days
    .subcollections.syllabuses
    .fields;

  assert.deepEqual(syllabusFields.coreMission, {
    type: "map",
    fields: {
      topicId: "string",
      practiceId: "string"
    }
  });
});
