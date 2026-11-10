const {test} = require("node:test"), assert = require("node:assert/strict");
const {createSchoolAuthorizer} = require("./infrastructure/access");
const {listInput, changes} = require("./domain/school");
const {createSchoolCatalogHandler} = require("../../school_catalog");
const {schoolSearchPrefixes, wordPrefixQuery, MAX_WORD_PREFIX_LENGTH} = require("./domain/school_search");

test("school authorization checks fresh account state and verified administrator membership", async () => {
  let user = {uid: "reader", email: "admin@example.test", emailVerified: true, disabled: false};
  const authorize = createSchoolAuthorizer({getUser: async () => user, isAdministrator: async email => email === "admin@example.test"});
  await assert.rejects(authorize({}, {}), {code: "unauthenticated"});
  assert.equal((await authorize({write: true}, {auth: {uid: "reader"}})).administrator, true);
  user = {...user, emailVerified: false};
  await assert.rejects(authorize({write: true}, {auth: {uid: "reader", token: {email_verified: true}}}), {code: "permission-denied"});
  assert.equal((await authorize({}, {auth: {uid: "reader"}})).administrator, false);
  user = {...user, disabled: true};
  await assert.rejects(authorize({}, {auth: {uid: "reader"}}), {code: "permission-denied"});
});
test("directory contracts reject broad lists, oversized pages, forged audit fields and broken hierarchy", () => {
  for (const input of [{}, {country: "Malaysia"}, {country: "Malaysia", level: "tertiary"},
    {country: "Malaysia", level: "primary", limit: 101}, {country: "Malaysia", level: "primary", localityId: "town"}]) {
    assert.throws(() => listInput("school", input, true), {code: "invalid-argument"});
  }
  assert.throws(() => listInput("school", {country: "Malaysia", level: "primary", status: "all"}), {code: "permission-denied"});
  assert.throws(() => changes("state", {country: "Malaysia", name: "State", createdBy: "forged"}), {code: "invalid-argument"});
});
test("callable exposes only directory operations and forwards authenticated identity", async () => {
  let received;
  const handler = createSchoolCatalogHandler({apis: {getSchool: async (...input) => {received = input; return {id: "school"};}}});
  await assert.rejects(handler({data: {action: "getSchool"}}), {code: "unauthenticated"});
  await assert.rejects(handler({auth: {uid: "user"}, data: {action: "constructor"}}), {code: "invalid-argument"});
  assert.deepEqual(await handler({auth: {uid: "user"}, data: {action: "getSchool", input: {id: "school", updatedBy: "forged"}}}), {id: "school"});
  assert.deepEqual(received[1], {auth: {uid: "user"}});
});
test("school word prefixes normalize case, compatibility characters, punctuation and repeated words", () => {
  const prefixes = schoolSearchPrefixes("ＳＪＫＣ Chung-Hua, CHUNG");
  assert.deepEqual(prefixes, ["c", "ch", "chu", "chun", "chung", "h", "hu", "hua", "s", "sj", "sjk", "sjkc"]);
  assert.equal(wordPrefixQuery("  ＣＨＵＮＧ!  "), "chung");
  assert.ok(schoolSearchPrefixes("École 中文学校").includes("中文"));
  assert.ok(schoolSearchPrefixes("École 中文学校").includes("éc"));
  const long = schoolSearchPrefixes("İ".repeat(200));
  assert.ok(long.every(prefix => Array.from(prefix).length <= MAX_WORD_PREFIX_LENGTH));
  assert.equal(new Set(long).size, long.length);
  assert.equal(wordPrefixQuery("c"), "c");
  assert.equal(wordPrefixQuery("Hua CHUNG chung"), "chung hua");
  for (const query of ["!!!", "x".repeat(MAX_WORD_PREFIX_LENGTH + 1)]) {
    assert.throws(() => wordPrefixQuery(query), {code: "invalid-argument"});
  }
});
test("search prefixes are server-owned school fields and search modes are explicit", async () => {
  const input = {country: "Malaysia", level: "primary", stateId: "state", localityId: "town", name: "SJKC Chung Hua"};
  const school = changes("school", input);
  assert.ok(school.searchPrefixes.includes("chung"));
  const renamed = changes("school", {name: "SJKC Sin Min"}, school);
  assert.ok(renamed.searchPrefixes.includes("sin")); assert.equal(renamed.searchPrefixes.includes("chung"), false);
  assert.throws(() => changes("school", {...input, searchPrefixes: ["forged"]}), {code: "invalid-argument"});
  assert.equal(changes("state", {country: "Malaysia", name: "State"}).searchPrefixes, undefined);
  const legacy = listInput("school", {country: "Malaysia", level: "primary", search: "SJKC Chung"});
  assert.equal(legacy.searchMode, "namePrefix"); assert.equal(legacy.search, "sjkc chung");
  const query = listInput("school", {country: "Malaysia", level: "primary", search: "CHU", searchMode: "wordPrefix"});
  assert.equal(query.search, "chu"); assert.equal(query.searchMode, "wordPrefix");
  const multi = listInput("school", {country: "Malaysia", level: "primary", search: "SJKC Chung H", searchMode: "wordPrefix"});
  assert.deepEqual(multi.searchTerms, ["chung", "h", "sjkc"]); assert.equal(multi.searchAnchor, "chung");
  assert.throws(() => listInput("school", {country: "Malaysia", level: "primary", searchMode: "contains"}), {code: "invalid-argument"});
  assert.throws(() => listInput("state", {country: "Malaysia", searchMode: "wordPrefix"}), {code: "invalid-argument"});
  const backend = require("../../schema/school_schema");
  const frontend = await import(require("node:url").pathToFileURL(require("node:path").resolve(__dirname, "../../../public/config/firebase/school_schema.js")).href);
  assert.deepEqual(frontend.schoolSchema, backend.schoolSchema);
});
test("production index definitions cover every supported directory filter combination", () => {
  const fs = require("node:fs"), path = require("node:path");
  const indexes = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../firestore.indexes.json"), "utf8")).indexes;
  const {COLLECTIONS} = require("./domain/school");
  function check(kind, input) {
    const query = listInput(kind, input, true), equality = Object.keys(query.filters).sort();
    const arraySearch = query.searchMode === "wordPrefix" && query.search;
    assert.ok(indexes.some(index => {
      const fields = index.fields.map(field => field.fieldPath);
      return index.collectionGroup === COLLECTIONS[kind] && index.queryScope === "COLLECTION" &&
        fields.at(-2) === query.sort && fields.at(-1) === "__name__" &&
        JSON.stringify(fields.slice(0, -2).filter(field => field !== "searchPrefixes").sort()) === JSON.stringify(equality) &&
        (arraySearch ? index.fields.some(field => field.fieldPath === "searchPrefixes" && field.arrayConfig === "CONTAINS") : !fields.includes("searchPrefixes"));
    }), `Missing ${kind} index: ${JSON.stringify(query.filters)}`);
  }
  for (const status of ["active", "all"]) {
    check("state", {country: "Malaysia", status});
    check("locality", {country: "Malaysia", stateId: "state", status});
    for (const geo of [{}, {stateId: "state"}, {stateId: "state", localityId: "town"}]) {
      for (const stream of [{}, {streamId: "stream"}]) {
        check("school", {country: "Malaysia", level: "primary", status, ...geo, ...stream});
        check("school", {country: "Malaysia", level: "primary", status, ...geo, ...stream, searchMode: "wordPrefix", search: "chung"});
      }
    }
  }
  check("stream", {country: "Malaysia", level: "primary"});
});
