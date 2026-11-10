const {test} = require("node:test"), assert = require("node:assert/strict");
const {prepareImport, createRestStore, applyPlan, verifyPlan} = require("./import-malaysia-primary-schools.cjs");
function fixture() {
  const records = [
    {sourceRow: 6, name: "Same School", category: "SK", state: "Johor", locality: "Town"},
    {sourceRow: 7, name: "Same School", category: "SK", state: "Johor", locality: "Town"},
    {sourceRow: 8, name: "Same School", category: "SJKC", state: "Johor", locality: "Town"},
    {sourceRow: 9, name: "Tamil School", category: "SJKT", state: "Perak", locality: "Town"},
  ];
  const dataset = {datasetId: "malaysia-public-primary-2022-kpm-june", country: "Malaysia", level: "primary", snapshotDate: "2022-06-30", sourceSha256: "a".repeat(64), records};
  const inventory = {scopes: [{id: "Malaysia", country: "Malaysia", levels: {primary: {4: true}}, _updateTime: "2026-01-01T00:00:00Z"}],
    streams: ["SK", "SJKC", "SJKT"].map(id => ({id, name: id, country: "Malaysia", level: "primary", _updateTime: "2026-01-01T00:00:00Z"})), states: [], localities: [], schools: []};
  return {dataset, inventory};
}
test("import preserves indistinguishable rows and separates towns by state", () => {
  const {dataset, inventory} = fixture(), plan = prepareImport(dataset, inventory);
  assert.deepEqual(plan.summary.create, [2, 2, 4]);
  assert.equal(new Set(plan.stages[2].map(record => record.id)).size, 4);
  assert.equal(plan.duplicates.length, 1); assert.deepEqual(plan.duplicates[0].records.map(record => record.sourceRow), [6, 7]);
  assert.equal(plan.stages[2][2].data.streamId, "SJKC");
  assert.equal(plan.stages[2][0].data.schoolCode, "");
  assert.ok(plan.stages[2][0].data.searchPrefixes.includes("school"));
});
test("import reruns create nothing and preserve existing records", () => {
  const {dataset, inventory} = fixture(), first = prepareImport(dataset, inventory);
  const [states, localities, schools] = first.stages.map(stage => stage.map(record => ({id: record.id, ...record.data, _updateTime: "2026-01-01T00:00:00Z"})));
  schools[0].name = "Manually edited school";
  const rerun = prepareImport(dataset, {...inventory, states, localities, schools});
  assert.deepEqual(rerun.summary.create, [0, 0, 0]); assert.deepEqual(rerun.summary.reuse, [2, 2, 4]);
  assert.equal(verifyPlan(rerun, {...inventory, states, localities, schools}), 8);
});
test("import validates stream mappings, source categories, rows and archived parents before writes", () => {
  const {dataset, inventory} = fixture();
  assert.throws(() => prepareImport(dataset, {...inventory, streams: inventory.streams.slice(1)}), /Configure one.*SK/);
  assert.throws(() => prepareImport(dataset, {...inventory, streams: [...inventory.streams, {...inventory.streams[0], id: "duplicate"}]}), /Ambiguous/);
  assert.throws(() => prepareImport({...dataset, records: [{...dataset.records[0], category: "K9"}]}, inventory), /Unsupported/);
  assert.throws(() => prepareImport({...dataset, records: [dataset.records[0], dataset.records[0]]}, inventory), /repeated source/);
  assert.throws(() => prepareImport(dataset, {...inventory, states: [{id: "johor", country: "Malaysia", name: "Johor", status: "archived"}]}), /archived/);
});
test("REST writes verify parent versions, create without replacement, and generate server timestamps", async () => {
  let written;
  const store = createRestStore({project: "demo-school-import", origin: "http://localhost:9999", request: async (url, data) => {
    written = {url, ...data}; return {writeResults: [{}, {updateTime: "2026-01-02T00:00:00Z"}]};
  }});
  const versions = new Map([["schoolStates/parent", "2026-01-01T00:00:00Z"]]);
  await store.createBatch([{collection: "schoolLocalities", id: "town", data: {name: "Town"}, parents: ["schoolStates/parent"]}], versions, "test-importer");
  assert.deepEqual(written.writes[0].currentDocument, {updateTime: "2026-01-01T00:00:00Z"});
  assert.deepEqual(written.writes[1].currentDocument, {exists: false});
  assert.equal(written.writes[1].updateTransforms.length, 2);
  assert.equal(versions.get("schoolLocalities/town"), "2026-01-02T00:00:00Z");
});
test("real REST import can resume, validates parents atomically and never overwrites existing records", {skip: !process.env.FIRESTORE_EMULATOR_HOST}, async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/);
  const project = "demo-school-import", root = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
  const {dataset, inventory} = fixture();
  const request = async (url, data) => {
    const response = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json", Authorization: "Bearer owner"}, body: JSON.stringify(data)});
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error?.message || "Emulator request failed"), {status: response.status});
    return result;
  };
  await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, {method: "DELETE"});
  const string = value => ({stringValue: value});
  await request(root + ":commit", {writes: [
    {update: {name: `projects/${project}/databases/(default)/documents/syllabusScope/Malaysia`, fields: {country: string("Malaysia"), levels: {mapValue: {fields: {primary: {mapValue: {fields: {4: {booleanValue: true}}}}}}}}}},
    ...inventory.streams.map(record => ({update: {name: `projects/${project}/databases/(default)/documents/streams/${record.id}`, fields: {name: string(record.name), country: string("Malaysia"), level: string("primary")}}})),
  ]});
  const store = createRestStore({request, project, origin: `http://${host}`});
  let actual = await store.inventory(), plan = prepareImport(dataset, actual);
  assert.deepEqual(await applyPlan(plan, store, {actor: "test-importer"}), [2, 2, 4]);
  actual = await store.inventory();
  assert.equal(verifyPlan(plan, actual), 8);
  plan = prepareImport(dataset, actual);
  assert.deepEqual(plan.summary.create, [0, 0, 0]);
  assert.deepEqual(await applyPlan(plan, store, {actor: "test-importer"}), [0, 0, 0]);
  assert.equal(actual.schools.length, 4);
  const parent = actual.states[0];
  await request(root + ":commit", {writes: [{update: {name: `projects/${project}/databases/(default)/documents/schoolStates/${parent.id}`, fields: {status: string("archived")}}, updateMask: {fieldPaths: ["status"]}}]});
  const versions = new Map([[`schoolStates/${parent.id}`, parent._updateTime]]);
  await assert.rejects(store.createBatch([{collection: "schoolLocalities", id: "cannot-create", data: {name: "Town"}, parents: [`schoolStates/${parent.id}`]}], versions, "test-importer"));
  const response = await fetch(root + "/schoolLocalities/cannot-create", {headers: {Authorization: "Bearer owner"}});
  assert.equal(response.status, 404);
});
