const assert = require("node:assert/strict");
const test = require("node:test");
const {pruneAllStudentLoginHistory} = require("./prune_all_student_login_history");

test("daily maintenance pages through inactive students and bounds concurrent cleanup", async () => {
  const visited = [];
  let running = 0;
  let maximumRunning = 0;
  const result = await pruneAllStudentLoginHistory({
    concurrency: 2,
    repository: {
      async listStudentIds({cursor}) {
        return cursor === null
          ? {studentIds: ["one", "two", "three"], nextCursor: "three"}
          : {studentIds: ["four", "five"], nextCursor: null};
      },
      async pruneHistory({studentId}) {
        visited.push(studentId);
        running++;
        maximumRunning = Math.max(maximumRunning, running);
        await new Promise((resolve) => setImmediate(resolve));
        running--;
        return {deletedCount: 3};
      },
    },
  });
  assert.deepEqual(visited, ["one", "two", "three", "four", "five"]);
  assert.equal(maximumRunning, 2);
  assert.deepEqual(result, {studentCount: 5, deletedCount: 15});
});

test("maintenance continues past failed students and reports failure for scheduled retry", async () => {
  const visited = [];
  await assert.rejects(() => pruneAllStudentLoginHistory({
    repository: {
      async listStudentIds() { return {studentIds: ["good", "bad", "later"], nextCursor: null}; },
      async pruneHistory({studentId}) {
        visited.push(studentId);
        if (studentId === "bad") throw new Error("Storage unavailable");
        return {deletedCount: 1};
      },
    },
  }), (error) => error instanceof AggregateError && error.errors.length === 1
    && error.errors[0].cause.message === "Storage unavailable");
  assert.deepEqual(visited, ["good", "bad", "later"]);
});

test("empty maintenance does no deletion and storage enumeration failures propagate", async () => {
  assert.deepEqual(await pruneAllStudentLoginHistory({
    repository: {
      async listStudentIds() { return {studentIds: [], nextCursor: null}; },
      async pruneHistory() { assert.fail("No students to prune"); },
    },
  }), {studentCount: 0, deletedCount: 0});
  await assert.rejects(() => pruneAllStudentLoginHistory({
    repository: {async listStudentIds() { throw new Error("List unavailable"); }},
  }), /List unavailable/);
});
