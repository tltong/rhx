const assert = require("node:assert/strict");
const {test} = require("node:test");
const {IsTopicTutorEnabled} = require("./application/is_topic_tutor_enabled");
const {SyllabusTopic} = require("./domain/syllabus");
const {FirestoreSyllabusRepository} = require("./infrastructure/firestore_syllabus_repository");

test("backend topic policy reads true, false and the legacy default without writes", async () => {
  const repository = new FirestoreSyllabusRepository({
    readDocument: async () => ({id: "math", country: "Malaysia", level: "primary", year: 4, subject: "Mathematics"}),
    readCollection: async () => [
      {id: "on", topicName: "On", tutorEnabled: true},
      {id: "off", topicName: "Off", tutorEnabled: false},
      {id: "legacy", topicName: "Legacy"},
    ],
    writeDocument: () => {throw new Error("Read must not write");},
  });
  const api = new IsTopicTutorEnabled(repository);
  assert.equal(await api.execute("math", "on"), true);
  assert.equal(await api.execute(" math ", " off "), false);
  assert.equal(await api.execute("math", "legacy"), true);
});

test("backend policy rejects invalid flags and missing scope instead of enabling tutor", async () => {
  for (const tutorEnabled of [null, "false", 0, 1]) {
    assert.throws(() => new SyllabusTopic({id: "t", topicName: "Topic", tutorEnabled}), /tutorEnabled must be a boolean/);
    await assert.rejects(() => new IsTopicTutorEnabled({getById: async () => ({topics: [{id: "t", tutorEnabled}]})}).execute("s", "t"), /tutorEnabled must be a boolean/);
  }
  const api = new IsTopicTutorEnabled({getById: async id => id === "s" ? {topics: []} : null});
  for (const ids of [["", "t"], ["s", ""], ["missing", "t"], ["s", "missing"]]) {
    await assert.rejects(() => api.execute(...ids));
  }
});
