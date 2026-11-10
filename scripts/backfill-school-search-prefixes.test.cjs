const {test} = require("node:test"), assert = require("node:assert/strict");
const {prepareBackfill, createSearchPrefixStore, applyBackfill} = require("./backfill-school-search-prefixes.cjs");
const {schoolSearchPrefixes} = require("../functions/features/school/domain/school_search");
test("backfill plans repair missing/stale prefixes without mutating source records and block invalid names", async () => {
  const records = [
    {id: "ready", name: "SJKC Chung Hua", searchPrefixes: schoolSearchPrefixes("SJKC Chung Hua"), _updateTime: "version-1"},
    {id: "missing", name: "SJKC Chung Hua", _updateTime: "version-2", version: 7, unrelated: {preserve: true}},
    {id: "renamed", name: "SJKC Sin Min", searchPrefixes: ["chung"], _updateTime: "version-3"},
    {id: "malformed", name: "SK School", searchPrefixes: "incorrect", _updateTime: "version-4"},
  ];
  const copy = structuredClone(records), plan = prepareBackfill(records);
  assert.deepEqual(plan.summary, {schools: 4, ready: 1, update: 3, invalid: 0});
  assert.deepEqual(records, copy);
  assert.equal(plan.changes.find(record => record.id === "renamed").searchPrefixes.includes("chung"), false);
  const invalid = prepareBackfill([...records, {id: "invalid", name: "", _updateTime: "version-5"}]);
  assert.equal(invalid.summary.invalid, 1);
  let writes = 0;
  await assert.rejects(applyBackfill(invalid, {updateBatch: async () => {writes++;}}), /invalid school names/);
  assert.equal(writes, 0);
});
test("backfill writes only the prefix field with a document-version precondition", async () => {
  const project = "demo-school-search-backfill", document = `projects/${project}/databases/(default)/documents/schools/school`;
  let body;
  const store = createSearchPrefixStore({project, country: "Malaysia", selectedLevel: "primary", request: async (url, data) => {body = data; return {};}});
  await store.updateBatch([{id: "school", path: document, updateTime: "2026-01-01T00:00:00Z", searchPrefixes: ["ch", "chu"]}]);
  assert.deepEqual(body.writes, [{update: {name: document, fields: {searchPrefixes: {arrayValue: {values: [{stringValue: "ch"}, {stringValue: "chu"}]}}}},
    updateMask: {fieldPaths: ["searchPrefixes"]}, currentDocument: {updateTime: "2026-01-01T00:00:00Z"}}]);
  await assert.rejects(store.updateBatch([{id: "school", path: document.replace("schools", "students"), updateTime: "v1", searchPrefixes: []}]), /Invalid backfill/);
});
test("real backfill pages records, rejects stale names, resumes interrupted batches and preserves other fields", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/);
  const project = "demo-school-search-backfill", database = `projects/${project}/databases/(default)/documents`, root = `http://${host}/v1/${database}`;
  const request = async (url, data) => {
    const response = await fetch(url, {method: "POST", headers: {"content-type": "application/json", Authorization: "Bearer owner"}, body: JSON.stringify(data)});
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error?.message || "Emulator request failed"), {status: response.status});
    return result;
  };
  await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, {method: "DELETE"});
  const string = stringValue => ({stringValue}), name = "SJKC Chung Hua";
  const writes = Array.from({length: 501}, (_, i) => ({update: {name: `${database}/schools/school-${String(i).padStart(3, "0")}`,
    fields: {name: string(name), country: string("Malaysia"), level: string("primary"), status: string(i % 2 ? "archived" : "active"),
      version: {integerValue: "7"}, streamId: string("stream-original"), unrelated: {mapValue: {fields: {preserve: {booleanValue: true}}}},
      ...(i === 0 ? {searchPrefixes: {arrayValue: {values: schoolSearchPrefixes(name).map(string)}}} : {})}}}));
  for (const [id, country, level] of [["foreign", "Singapore", "primary"], ["secondary", "Malaysia", "secondary"]]) {
    writes.push({update: {name: `${database}/schools/${id}`, fields: {name: string(name), country: string(country), level: string(level)}}});
  }
  for (let offset = 0; offset < writes.length; offset += 200) await request(root + ":commit", {writes: writes.slice(offset, offset + 200)});
  const get = async id => (await (await fetch(root + "/schools/" + id, {headers: {Authorization: "Bearer owner"}})).json());
  const store = createSearchPrefixStore({request, project, country: "Malaysia", selectedLevel: "primary", origin: `http://${host}`});
  const original = await get("school-000"), missingBefore = await get("school-002");
  let plan = prepareBackfill(await store.read());
  assert.deepEqual(plan.summary, {schools: 501, ready: 1, update: 500, invalid: 0});
  assert.deepEqual(await get("school-002"), missingBefore, "A preview never writes");

  await request(root + ":commit", {writes: [{update: {name: `${database}/schools/school-001`, fields: {name: string("SJKC Sin Min")}}, updateMask: {fieldPaths: ["name"]}}]});
  await assert.rejects(applyBackfill(plan, store));
  assert.deepEqual(await get("school-002"), missingBefore, "The stale batch is rejected atomically");
  plan = prepareBackfill(await store.read());
  let batches = 0;
  await assert.rejects(applyBackfill(plan, {updateBatch: async records => {
    if (++batches === 2) throw new Error("Injected interruption");
    return store.updateBatch(records);
  }}), /Injected interruption/);
  const resumed = prepareBackfill(await store.read());
  assert.equal(resumed.summary.ready, 201); assert.equal(resumed.summary.update, 300);
  assert.equal(await applyBackfill(resumed, store), 300);
  const verified = prepareBackfill(await store.read());
  assert.equal(verified.summary.ready, 501); assert.equal(verified.summary.update, 0);
  assert.equal(await applyBackfill(verified, store), 0);
  assert.deepEqual(await get("school-000"), original, "Already-correct records are not rewritten");
  const migrated = await get("school-002");
  const {searchPrefixes, ...afterFields} = migrated.fields;
  assert.deepEqual(afterFields, missingBefore.fields, "Every unrelated field is preserved");
  assert.ok(searchPrefixes.arrayValue.values.some(value => value.stringValue === "chung"));
  const renamed = await get("school-001");
  assert.equal(renamed.fields.name.stringValue, "SJKC Sin Min");
  assert.ok(renamed.fields.searchPrefixes.arrayValue.values.some(value => value.stringValue === "sin"));
  assert.equal(renamed.fields.searchPrefixes.arrayValue.values.some(value => value.stringValue === "chung"), false);
  assert.equal((await get("foreign")).fields.searchPrefixes, undefined);
  assert.equal((await get("secondary")).fields.searchPrefixes, undefined);
});
