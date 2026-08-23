const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ListAvailableSyllabusesForStudent,
} = require("./application/list_available_syllabuses_for_student");
const {Stream} = require("../stream/domain/stream");
const syllabusSubscriptionModule = require("./syllabus_subscription_module");

const NOW = new Date("2026-08-23T00:00:00.000Z");

function makeStudent(overrides = {}) {
  return {
    id: "student-1",
    country: "Malaysia",
    level: "primary",
    yearOfRegistration: 2025,
    standardAtYearOfRegistration: "3",
    ...overrides,
  };
}

function makeStream() {
  const stream = new Stream({
    id: "stream-1",
    name: "Primary Stream",
    country: "Malaysia",
    level: "primary",
  });
  stream.attachSyllabus(4, "science-4", "English", NOW);
  stream.attachSyllabus(4, "math-4", "Malay", NOW);

  return stream;
}

function makeUseCase({
  student = makeStudent(),
  subscription = {studentId: "student-1", streamId: "stream-1"},
  stream = makeStream(),
} = {}) {
  return new ListAvailableSyllabusesForStudent({
    getStudentById: async () => student,
    getStudentStreamSubscription: async () => subscription,
    getStreamById: async () => stream,
    now: () => NOW,
  });
}

test("syllabus subscription module exposes student availability", () => {
  assert.deepEqual(Object.keys(syllabusSubscriptionModule).sort(), [
    "getStudentSyllabusSubscriptionLanguage",
    "listAvailableSyllabusesForStudent",
  ]);
});

test("lists syllabus-language pairs for the student's current stream year", async () => {
  const result = await makeUseCase().execute("student-1");

  assert.deepEqual(result, [
    {syllabusId: "math-4", language: "Malay"},
    {syllabusId: "science-4", language: "English"},
  ]);
});

test("returns no syllabuses when the student has no stream subscription", async () => {
  let streamRead = false;
  const useCase = new ListAvailableSyllabusesForStudent({
    getStudentById: async () => makeStudent(),
    getStudentStreamSubscription: async () => null,
    getStreamById: async () => {
      streamRead = true;
      return makeStream();
    },
    now: () => NOW,
  });

  assert.deepEqual(await useCase.execute("student-1"), []);
  assert.equal(streamRead, false);
});

test("returns no syllabuses when the stream has no current-year assignment", async () => {
  const stream = makeStream();
  stream.years = [];

  assert.deepEqual(
    await makeUseCase({stream}).execute("student-1"),
    [],
  );
});

test("rejects a stream outside the student's country or level", async () => {
  const stream = makeStream();
  stream.country = "Singapore";

  await assert.rejects(
    makeUseCase({stream}).execute("student-1"),
    /scopes do not match/,
  );
});
