/** One-time/resumable, create-only import of the approved June 2022 SK/SJKC/SJKT workbook. */
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const {isDeepStrictEqual} = require("node:util");
const {changes, nameKey} = require("../functions/features/school/domain/school");
const DATASET = "malaysia-public-primary-2022-kpm-june";
const COUNTRY = "Malaysia", LEVEL = "primary", CATEGORIES = ["SK", "SJKC", "SJKT"];
const ref = (collection, id) => `${collection}/${id}`;
const digest = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
const key = values => JSON.stringify(values.map(value => nameKey(value)));
const schoolKey = data => key([data.name, data.stateId, data.localityId, data.streamId || ""]);
function fail(message) {throw new Error(message);}
function unique(records, predicate, label) {
  const found = records.filter(predicate);
  if (found.length > 1) fail(`Ambiguous existing ${label}. Resolve the duplicates before importing.`);
  return found[0];
}
function prepareImport(dataset, inventory) {
  if (dataset.datasetId !== DATASET || dataset.country !== COUNTRY || dataset.level !== LEVEL || dataset.snapshotDate !== "2022-06-30") fail("Unexpected dataset or school scope.");
  if (!/^[a-f0-9]{64}$/.test(dataset.sourceSha256 || "") || !Array.isArray(dataset.records) || !dataset.records.length) fail("Source checksum and school records are required.");
  const scope = unique(inventory.scopes, item => item.country === COUNTRY, "Malaysia scope");
  if (!scope || !Object.values((scope.levels ?? scope).primary || {}).some(Boolean)) fail("Malaysia primary must already be configured in Syllabus Scope.");
  const streamMap = {};
  for (const category of CATEGORIES) {
    const stream = unique(inventory.streams, item => item.country === COUNTRY && item.level === LEVEL && nameKey(item.name) === nameKey(category), `${category} stream`);
    if (!stream) fail(`Configure one Malaysia primary ${category} stream before importing.`);
    streamMap[category] = stream.id;
  }
  const scopeRef = ref("syllabusScope", scope.id);
  const references = new Map([[scopeRef, scope._updateTime]]);
  for (const stream of inventory.streams) references.set(ref("streams", stream.id), stream._updateTime);
  for (const state of inventory.states) references.set(ref("schoolStates", state.id), state._updateTime);
  for (const town of inventory.localities) references.set(ref("schoolLocalities", town.id), town._updateTime);
  const states = new Map(), towns = new Map(), schools = [], rows = new Set(), occurrences = new Map();
  const sourcesByRow = new Map(dataset.records.map(row => [row.sourceRow, row]));
  const adopted = new Set(), byId = new Map(inventory.schools.map(record => [record.id, record]));
  const bySchoolKey = new Map();
  for (const school of inventory.schools) {
    if (school.country !== COUNTRY || school.level !== LEVEL) continue;
    const identity = schoolKey(school);
    if (!bySchoolKey.has(identity)) bySchoolKey.set(identity, []);
    bySchoolKey.get(identity).push(school);
  }
  const categories = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
  for (const input of dataset.records) {
    if (!Number.isInteger(input.sourceRow) || input.sourceRow < 6 || rows.has(input.sourceRow)) fail("Missing or repeated source worksheet row.");
    rows.add(input.sourceRow);
    if (!CATEGORIES.includes(input.category)) fail(`Unsupported school category at source row ${input.sourceRow}.`);
    categories[input.category]++;
    const stateData = changes("state", {country: COUNTRY, name: input.state});
    const stateKey = key([COUNTRY, stateData.name]);
    if (!states.has(stateKey)) {
      const existing = unique(inventory.states, item => item.country === COUNTRY && nameKey(item.name) === stateData.nameNormalized, `state ${stateData.name}`);
      if (existing && existing.status !== "active") fail(`State ${stateData.name} is archived.`);
      const id = existing?.id || "my-state-" + digest([COUNTRY, stateData.nameNormalized]);
      states.set(stateKey, {collection: "schoolStates", id, data: stateData, existing: !!existing, parents: [scopeRef]});
    }
    const state = states.get(stateKey);
    // The source column is BANDARSURAT: a postal town, with no official city classification.
    const townData = changes("locality", {country: COUNTRY, stateId: state.id, name: input.locality, type: "town"});
    const townKey = key([state.id, townData.name]);
    if (!towns.has(townKey)) {
      const existing = unique(inventory.localities, item => item.country === COUNTRY && item.stateId === state.id && nameKey(item.name) === townData.nameNormalized, `postal town ${townData.name}`);
      if (existing && existing.status !== "active") fail(`Postal town ${townData.name} is archived.`);
      const id = existing?.id || "my-postal-" + digest([state.id, townData.nameNormalized]);
      towns.set(townKey, {collection: "schoolLocalities", id, data: townData, existing: !!existing, parents: [scopeRef, ref("schoolStates", state.id)]});
    }
    const town = towns.get(townKey);
    const data = changes("school", {country: COUNTRY, level: LEVEL, name: input.name, stateId: state.id, localityId: town.id, streamId: streamMap[input.category]});
    const sourceIdentity = key([data.name, input.category, stateData.name, townData.name]);
    const occurrence = (occurrences.get(sourceIdentity) || 0) + 1;
    occurrences.set(sourceIdentity, occurrence);
    const generatedId = "my-primary-2022-" + digest([DATASET, sourceIdentity, occurrence]);
    let existing = byId.get(generatedId);
    if (!existing) existing = (bySchoolKey.get(schoolKey(data)) || []).find(record => !adopted.has(record.id));
    const id = existing?.id || generatedId;
    if (adopted.has(id)) fail("Two source schools resolved to the same backend record.");
    adopted.add(id);
    schools.push({collection: "schools", id, data, existing: !!existing, sourceRow: input.sourceRow, category: input.category,
      parents: [scopeRef, ref("schoolStates", state.id), ref("schoolLocalities", town.id), ref("streams", data.streamId)]});
  }
  const stages = [[...states.values()], [...towns.values()], schools];
  const duplicates = [...occurrences].filter(([, count]) => count > 1).map(([identity, count]) => ({identity: JSON.parse(identity), count,
    records: schools.filter(school => {
      const source = sourcesByRow.get(school.sourceRow);
      return key([school.data.name, source.category, source.state, source.locality]) === identity;
    }).map(({id, sourceRow}) => ({id, sourceRow}))}));
  return {datasetId: DATASET, sourceSha256: dataset.sourceSha256, snapshotDate: dataset.snapshotDate, streamMap, references, stages,
    summary: {schools: schools.length, states: states.size, localities: towns.size, categories,
      create: stages.map(stage => stage.filter(item => !item.existing).length), reuse: stages.map(stage => stage.filter(item => item.existing).length)}, duplicates};
}
function encode(value) {
  if (Array.isArray(value)) return {arrayValue: {values: value.map(encode)}};
  if (value === null) return {nullValue: null};
  if (typeof value === "string") return {stringValue: value};
  if (typeof value === "boolean") return {booleanValue: value};
  if (Number.isInteger(value)) return {integerValue: String(value)};
  fail("Unexpected field in an import record.");
}
function decode(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("timestampValue" in value) return value.timestampValue;
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, value]) => [key, decode(value)]));
  if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
  fail("Unexpected Firestore value.");
}
function createRestStore({request, project, origin = "https://firestore.googleapis.com"}) {
  const database = `projects/${project}/databases/(default)/documents`, root = `${origin}/v1/${database}`;
  async function read(collection) {
    const result = []; let after;
    do {
      const structuredQuery = {from: [{collectionId: collection}], where: {fieldFilter: {field: {fieldPath: "country"}, op: "EQUAL", value: {stringValue: COUNTRY}}},
        orderBy: [{field: {fieldPath: "__name__"}, direction: "ASCENDING"}], limit: 500,
        ...(after ? {startAt: {values: [{referenceValue: after}], before: false}} : {})};
      const response = await request(root + ":runQuery", {structuredQuery});
      const docs = response.filter(item => item.document).map(item => item.document);
      result.push(...docs.map(doc => ({...Object.fromEntries(Object.entries(doc.fields || {}).map(([key, value]) => [key, decode(value)])), id: doc.name.split("/").pop(), _updateTime: doc.updateTime})));
      after = docs.length === 500 ? docs.at(-1).name : null;
    } while (after);
    return result;
  }
  return {
    inventory: async () => {
      const [scopes, streams, states, localities, schools] = await Promise.all(["syllabusScope", "streams", "schoolStates", "schoolLocalities", "schools"].map(read));
      return {scopes, streams, states, localities, schools};
    },
    async createBatch(items, versions, actor) {
      const parents = [...new Set(items.flatMap(item => item.parents))];
      const checks = parents.map(parent => {
        if (!versions.get(parent)) fail(`Missing reference version for ${parent}.`);
        return {verify: `${database}/${parent}`, currentDocument: {updateTime: versions.get(parent)}};
      });
      const writes = items.map(item => ({update: {name: `${database}/${ref(item.collection, item.id)}`,
        fields: Object.fromEntries(Object.entries({...item.data, version: 1, createdBy: actor, updatedBy: actor}).map(([field, value]) => [field, encode(value)]))},
      currentDocument: {exists: false}, updateTransforms: ["createdAt", "updatedAt"].map(fieldPath => ({fieldPath, setToServerValue: "REQUEST_TIME"}))}));
      if (checks.length + writes.length > 500) fail("Import batch exceeds the Firestore write limit.");
      const response = await request(root + ":commit", {writes: [...checks, ...writes]});
      items.forEach((item, index) => versions.set(ref(item.collection, item.id), response.writeResults[checks.length + index].updateTime));
    },
  };
}
async function applyPlan(plan, store, {actor, progress = () => {}}) {
  const versions = new Map(plan.references), created = [0, 0, 0];
  for (let stage = 0; stage < plan.stages.length; stage++) {
    const pending = plan.stages[stage].filter(item => !item.existing);
    for (let offset = 0; offset < pending.length; offset += 200) {
      const batch = pending.slice(offset, offset + 200);
      await store.createBatch(batch, versions, actor);
      created[stage] += batch.length;
      progress({stage: ["states", "localities", "schools"][stage], completed: created[stage], total: pending.length});
    }
  }
  return created;
}
function verifyPlan(plan, inventory) {
  const maps = [inventory.states, inventory.localities, inventory.schools].map(records => new Map(records.map(record => [record.id, record])));
  let verified = 0;
  for (let stage = 0; stage < plan.stages.length; stage++) for (const item of plan.stages[stage]) {
    const saved = maps[stage].get(item.id);
    if (!saved) fail(`Imported record is missing: ${ref(item.collection, item.id)}.`);
    if (!item.existing) for (const [field, value] of Object.entries(item.data)) {
      if (!isDeepStrictEqual(saved[field], value)) fail(`Imported field mismatch: ${ref(item.collection, item.id)}.${field}.`);
    }
    verified++;
  }
  return verified;
}
async function main(args) {
  const input = {apply: false};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--apply") input.apply = true;
    else if (["--input", "--report"].includes(flag) && args[index + 1]) input[flag.slice(2)] = args[++index];
    else fail("Usage: node scripts/import-malaysia-primary-schools.cjs --input DATA.json --report REPORT.json [--apply]");
  }
  if (!input.input || !input.report) fail("Input and report paths are required.");
  if (process.env.FIRESTORE_EMULATOR_HOST) fail("The production command cannot run with emulator variables set.");
  const dataset = JSON.parse(fs.readFileSync(input.input, "utf8"));
  if (dataset.records?.length !== 7698) fail("The approved dataset must contain exactly 7,698 retained rows.");
  const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "null");
  if (!credentials || credentials.project_id !== "readyherox" || !credentials.client_email) fail("Configured readyherox credentials are required.");
  const {createRequire} = require("node:module");
  const {GoogleAuth} = createRequire(path.resolve(__dirname, "../../.rhx-tools/package.json"))("google-auth-library");
  const client = await new GoogleAuth({credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"]}).getClient();
  const store = createRestStore({project: "readyherox", request: async (url, data) => (await client.request({url, data, method: "POST", timeout: 60000, retry: false})).data});
  console.log("Reading existing backend records...");
  const inventory = await store.inventory(), plan = prepareImport(dataset, inventory);
  const report = {project: "readyherox", datasetId: plan.datasetId, sourceSha256: plan.sourceSha256, snapshotDate: plan.snapshotDate,
    startedAt: new Date().toISOString(), summary: plan.summary, streamMap: plan.streamMap, duplicateReview: plan.duplicates,
    status: "planned", records: plan.stages.flat().map(({collection, id, existing, sourceRow, category}) => ({collection, id, existing, sourceRow, category}))};
  const saveReport = () => {fs.mkdirSync(path.dirname(path.resolve(input.report)), {recursive: true}); fs.writeFileSync(input.report, JSON.stringify(report, null, 2) + "\n");};
  saveReport(); console.log(JSON.stringify({dryRun: !input.apply, ...plan.summary, duplicateGroups: plan.duplicates.length}));
  if (!input.apply) return;
  try {
    report.status = "running"; saveReport();
    report.created = await applyPlan(plan, store, {actor: credentials.client_email, progress: update => {
      report.progress = update; saveReport();
      if (update.stage !== "schools" || update.completed % 1000 === 0 || update.completed === update.total) console.log(JSON.stringify(update));
    }});
    const actual = await store.inventory();
    report.verifiedRecords = verifyPlan(plan, actual);
    const rerun = prepareImport(dataset, actual);
    if (rerun.summary.create.some(count => count !== 0)) fail("Idempotence verification found records that would be duplicated on a rerun.");
    report.rerunCreates = rerun.summary.create;
    report.status = "complete"; report.completedAt = new Date().toISOString(); saveReport();
    console.log(JSON.stringify({status: report.status, created: report.created, verifiedRecords: report.verifiedRecords, rerunCreates: report.rerunCreates, report: input.report}));
  } catch (error) {
    report.status = "interrupted"; report.error = {code: error.code || null, status: error.response?.status || null}; saveReport();
    throw error;
  }
}
module.exports = {prepareImport, createRestStore, applyPlan, verifyPlan};
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  const remote = error.response?.data?.error;
  console.error(JSON.stringify({importFailed: true, status: error.response?.status || null, code: error.code || null,
    reason: remote?.status || null, message: remote ? "The backend rejected a request. Rerun the dry run to inspect the current records." : error.message}));
  process.exitCode = 1;
});
