const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AddSyllabusScopeLanguage,
} = require("./application/add_syllabusscope_language");
const {
  DeleteSyllabusScopeLanguage,
} = require("./application/delete_syllabusscope_language");
const {
  ListSyllabusScopeCountries,
} = require("./application/list_syllabusscope_countries");
const { SyllabusScope } = require("./domain/syllabusscope");
const {
  FirestoreSyllabusScopeRepository,
} = require(
  "./infrastructure/firestore_syllabusscope_repository",
);
const syllabusScopeModule = require("./syllabusscope_module");

test("Functions module exposes the same syllabus-scope API as the website", () => {
  assert.deepEqual(
    Object.keys(syllabusScopeModule).sort(),
    [
      "addSyllabusScopeLanguage",
      "createSyllabusScopeRecord",
      "deleteSyllabusScopeLanguage",
      "deleteSyllabusScopeRecord",
      "findSyllabusScopeByCountry",
      "getSyllabusScopeById",
      "listSyllabusScopeCountries",
      "listSyllabusScopes",
      "updateSyllabusScopeRecord",
    ],
  );
});

test("country listing returns sorted, distinct scope countries", async () => {
  const useCase = new ListSyllabusScopeCountries({
    list: async () => [
      {country: "Singapore"},
      {country: " Malaysia "},
      {country: "malaysia"},
      {country: ""},
    ],
  });

  assert.deepEqual(
    await useCase.execute(),
    ["Malaysia", "Singapore"],
  );
});
test("repository lists current and legacy scope records as domain objects", async () => {
  const repository = new FirestoreSyllabusScopeRepository({
    readCollection: async () => [
      {
        id: "Singapore",
        country: "Singapore",
        languages: ["English"],
        primary: {4: true},
      },
      {
        id: "Malaysia",
        country: "Malaysia",
        languages: ["Malay", "English", "malay"],
        levels: {
          primary: {1: true, 2: false},
          secondary: {1: true},
        },
      },
    ],
  });

  const scopes = await repository.list();

  assert.equal(scopes.length, 2);
  assert.ok(scopes[0] instanceof SyllabusScope);
  assert.deepEqual(
    {
      id: scopes[0].id,
      country: scopes[0].country,
      languages: scopes[0].languages,
      levels: scopes[0].levels,
    },
    {
      id: "Malaysia",
      country: "Malaysia",
      languages: ["Malay", "English"],
      levels: {
        primary: {1: true, 2: false},
        secondary: {1: true},
      },
    },
  );
  assert.deepEqual(scopes[1].levels, {primary: {4: true}});
});

test("repository saves the synchronized Firestore record shape", async () => {
  let writeCall = null;
  const repository = new FirestoreSyllabusScopeRepository({
    writeDocument: async (...args) => {
      writeCall = args;
    },
  });
  const scope = new SyllabusScope({
    id: "Malaysia",
    country: "Malaysia",
    languages: ["English", "english", "Malay"],
    levels: {
      primary: {1: true, 2: false},
    },
  });

  const result = await repository.save(scope);

  assert.equal(result, scope);
  assert.deepEqual(writeCall, [
    "syllabusScope",
    "Malaysia",
    {
      country: "Malaysia",
      languages: ["English", "Malay"],
      levels: {
        primary: {1: true, 2: false},
      },
    },
    {merge: false},
  ]);
});

test("language use cases add and remove languages case-insensitively", async () => {
  const scope = new SyllabusScope({
    id: "Malaysia",
    country: "Malaysia",
    languages: ["English"],
  });
  let saveCount = 0;
  const repository = {
    getById: async () => scope,
    save: async () => {
      saveCount += 1;
      return scope;
    },
  };
  const addLanguage = new AddSyllabusScopeLanguage(repository);
  const deleteLanguage = new DeleteSyllabusScopeLanguage(repository);

  await addLanguage.execute("Malaysia", "english");
  await addLanguage.execute("Malaysia", "Malay");
  await deleteLanguage.execute("Malaysia", "ENGLISH");

  assert.deepEqual(scope.languages, ["Malay"]);
  assert.equal(saveCount, 3);
});
