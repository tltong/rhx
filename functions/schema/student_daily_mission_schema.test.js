const assert = require("node:assert/strict");
const test = require("node:test");

const {
  studentDailyMissionSchema,
} = require("./student_daily_mission_schema");

test("daily mission schema defines the core mission transaction reference", () => {
  const syllabusFields = studentDailyMissionSchema
    .subcollections.days
    .subcollections.syllabuses
    .fields;

  assert.deepEqual(syllabusFields.coreMission, {
    type: "map",
    fields: {
      topicId: "string",
      practiceId: "string",
      practiceType: {type: "enum", values: ["normal", "essay"], default: "normal"},
    },
  });
});
