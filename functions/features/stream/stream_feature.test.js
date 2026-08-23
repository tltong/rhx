const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AttachSyllabusToYear,
} = require("./application/attach_syllabus_to_year");
const { CreateStream } = require("./application/create_stream");
const {
  DetachSyllabusFromYear,
} = require("./application/detach_syllabus_from_year");
const {
  ListEligibleSyllabuses,
} = require("./application/list_eligible_syllabuses");
const {
  ListStreamsByScope,
} = require("./application/list_streams_by_scope");
const {
  listAvailableLevels,
  listAvailableYears,
} = require("./application/stream_scope");
const { Stream } = require("./domain/stream");
const {
  FirestoreStreamRepository,
} = require("./infrastructure/firestore_stream_repository");
const streamModule = require("./stream_module");

const NOW = new Date("2026-08-23T00:00:00.000Z");
const scope = {
  country: "Malaysia",
  levels: {
    primary: {1: true, 2: true, 3: false},
    secondary: {1: true},
  },
};

function makeStream() {
  return new Stream({
    id: "stream-1",
    name: "Primary Stream",
    country: "Malaysia",
    level: "primary",
    createdAt: NOW,
    updatedAt: NOW,
  });
}

test("stream module exposes matching web and Functions APIs", () => {
  assert.deepEqual(Object.keys(streamModule).sort(), [
    "attachSyllabusToStreamYear",
    "createStream",
    "deleteStream",
    "detachSyllabusFromStreamYear",
    "getStreamById",
    "listEligibleSyllabuses",
    "listStreamCountries",
    "listStreamLevels",
    "listStreamYears",
    "listStreams",
    "listStreamsByScope",
    "renameStream",
  ]);
});

test("scope helpers return only enabled levels and years", () => {
  assert.deepEqual(listAvailableLevels(scope), ["primary", "secondary"]);
  assert.deepEqual(listAvailableYears(scope, "PRIMARY"), [1, 2]);
});

test("stream listing filters by country, level, and year", async () => {
  const matchingStream = makeStream();
  matchingStream.attachSyllabus(1, "math-1", "English", NOW);
  const otherYearStream = new Stream({
    id: "stream-2",
    name: "Other Year Stream",
    country: "Malaysia",
    level: "primary",
  });
  otherYearStream.attachSyllabus(2, "math-2", "English", NOW);

  const useCase = new ListStreamsByScope({
    list: async () => [
      matchingStream,
      otherYearStream,
      new Stream({
        id: "stream-3",
        name: "Secondary Stream",
        country: "Malaysia",
        level: "secondary",
      }),
      new Stream({
        id: "stream-4",
        name: "Singapore Stream",
        country: "Singapore",
        level: "primary",
      }),
    ],
  });

  const streams = await useCase.execute("malaysia", "PRIMARY", 1);

  assert.deepEqual(streams.map((stream) => stream.id), ["stream-1"]);
});

test("create stream validates its scope and normalizes the level", async () => {
  const useCase = new CreateStream({
    streamRepository: {
      create: async (stream) => {
        stream.id = "stream-1";
        return stream;
      },
    },
    findSyllabusScopeByCountry: async () => scope,
    now: () => NOW,
  });

  const stream = await useCase.execute({
    name: "Primary Stream",
    country: "Malaysia",
    level: "PRIMARY",
  });

  assert.equal(stream.id, "stream-1");
  assert.equal(stream.level, "primary");
  assert.deepEqual(stream.createdAt, NOW);
});

test("attach validates the syllabus and persists its year assignment", async () => {
  const stream = makeStream();
  const writes = [];
  const useCase = new AttachSyllabusToYear({
    streamRepository: {
      getById: async () => stream,
      saveYearAssignment: async (streamId, assignment) => {
        writes.push([streamId, assignment.year, assignment.syllabuses]);
      },
      save: async (savedStream) => savedStream,
    },
    findSyllabusScopeByCountry: async () => scope,
    getSyllabusById: async () => ({
      id: "math-1",
      country: "Malaysia",
      level: "primary",
      year: 1,
      languages: ["English", "Malay"],
    }),
    now: () => NOW,
  });

  const assignment = await useCase.execute({
    streamId: "stream-1",
    year: 1,
    syllabusId: "math-1",
    language: "english",
  });

  assert.deepEqual(assignment.syllabusIds, ["math-1"]);
  assert.equal(assignment.getSyllabus("math-1").language, "English");
  assert.equal(writes[0][0], "stream-1");
  assert.equal(writes[0][1], 1);
  assert.equal(writes[0][2][0].language, "English");
});

test("attach permits a syllabus from another year in the selected bucket", async () => {
  const stream = makeStream();
  const useCase = new AttachSyllabusToYear({
    streamRepository: {
      getById: async () => stream,
      saveYearAssignment: async () => {},
      save: async (savedStream) => savedStream,
    },
    findSyllabusScopeByCountry: async () => scope,
    getSyllabusById: async () => ({
      id: "math-2",
      country: "Malaysia",
      level: "primary",
      year: 2,
      languages: ["English"],
    }),
  });

  const assignment = await useCase.execute({
    streamId: "stream-1",
    year: 1,
    syllabusId: "math-2",
    language: "English",
  });

  assert.deepEqual(assignment.syllabusIds, ["math-2"]);
});

test("stream domain requires a language for new attachments", () => {
  const stream = makeStream();

  assert.throws(
    () => stream.attachSyllabus(1, "math-1", "", NOW),
    /language is required/,
  );
});
test("attach rejects a language unavailable to the syllabus", async () => {
  const stream = makeStream();
  const useCase = new AttachSyllabusToYear({
    streamRepository: {
      getById: async () => stream,
      saveYearAssignment: async () => {},
      save: async (savedStream) => savedStream,
    },
    findSyllabusScopeByCountry: async () => scope,
    getSyllabusById: async () => ({
      id: "math-1",
      country: "Malaysia",
      level: "primary",
      year: 1,
      languages: ["English"],
    }),
  });

  await assert.rejects(
    useCase.execute({
      streamId: "stream-1",
      year: 1,
      syllabusId: "math-1",
      language: "Chinese",
    }),
    /not available/,
  );
});

test("repository preserves legacy attachments when migrating year records", async () => {
  const writes = [];
  const repository = new FirestoreStreamRepository({
    readDocument: async () => ({
      id: "stream-1",
      name: "Primary Stream",
      country: "Malaysia",
      level: "primary",
      createdAt: NOW,
      updatedAt: NOW,
    }),
    readCollection: async () => [{
      id: "1",
      year: 1,
      syllabusIds: ["math-1"],
    }],
    writeDocument: async (...args) => writes.push(args),
  });
  const stream = await repository.getById("stream-1");
  const assignment = stream.getYearAssignment(1);

  assert.deepEqual(assignment.syllabusIds, ["math-1"]);
  assert.equal(assignment.getSyllabus("math-1").language, "");

  await repository.saveYearAssignment("stream-1", assignment);

  assert.deepEqual(writes[0][2], {
    year: 1,
    syllabuses: {
      "math-1": {language: ""},
    },
  });
});
test("detaching the final syllabus deletes the year assignment", async () => {
  const stream = makeStream();
  stream.attachSyllabus(1, "math-1", "English", NOW);
  const deletes = [];
  const useCase = new DetachSyllabusFromYear({
    streamRepository: {
      getById: async () => stream,
      deleteYearAssignment: async (...args) => deletes.push(args),
      save: async (savedStream) => savedStream,
    },
    now: () => NOW,
  });

  const assignment = await useCase.execute({
    streamId: "stream-1",
    year: 1,
    syllabusId: "math-1",
  });

  assert.equal(assignment, null);
  assert.equal(stream.getYearAssignment(1), null);
  assert.deepEqual(deletes, [["stream-1", 1]]);
});

test("eligible syllabus listing includes every year for country and level", async () => {
  const useCase = new ListEligibleSyllabuses({
    findSyllabusScopeByCountry: async () => scope,
    listSyllabuses: async () => [
      {
        id: "science-1",
        country: "Malaysia",
        level: "primary",
        year: 1,
        subject: "Science",
        languages: ["English"],
        active: false,
      },
      {
        id: "math-2",
        country: "Malaysia",
        level: "primary",
        year: 2,
        subject: "Mathematics",
        languages: ["English"],
        active: true,
      },
    ],
  });

  assert.deepEqual(await useCase.execute({
    country: "Malaysia",
    level: "primary",
    year: 1,
  }), [
    {
      id: "science-1",
      year: 1,
      subject: "Science",
      languages: ["English"],
      active: false,
    },
    {
      id: "math-2",
      year: 2,
      subject: "Mathematics",
      languages: ["English"],
      active: true,
    },
  ]);
});
