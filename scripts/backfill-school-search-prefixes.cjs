/** Resumable, field-only maintenance of server-generated school word-prefix indexes. */
const fs = require("node:fs"), path = require("node:path");
const {isDeepStrictEqual} = require("node:util");
const {text, level} = require("../functions/features/school/domain/school");
const {schoolSearchPrefixes} = require("../functions/features/school/domain/school_search");
function prepareBackfill(documents) {
  const changes = [], invalid = [];
  for (const document of documents) {
    try {
      const searchPrefixes = schoolSearchPrefixes(text(document.name, "school name"));
      if (!isDeepStrictEqual(document.searchPrefixes, searchPrefixes)) {
        if (!document._updateTime) throw new Error("The source record has no update time.");
        changes.push({id: document.id, path: document.path, updateTime: document._updateTime, searchPrefixes});
      }
    } catch (error) {invalid.push({id: document.id, message: error.message});}
  }
  return {summary: {schools: documents.length, ready: documents.length - changes.length - invalid.length, update: changes.length, invalid: invalid.length}, changes, invalid};
}
function createSearchPrefixStore({request, project, country, selectedLevel, origin = "https://firestore.googleapis.com"}) {
  const database = `projects/${project}/databases/(default)/documents`, root = `${origin}/v1/${database}`;
  return {
    async read() {
      const result = []; let after;
      do {
        // Country equality + document-ID paging uses the existing single-field
        // index. Filtering level here avoids a migration-only composite index.
        const structuredQuery = {from: [{collectionId: "schools"}],
          select: {fields: ["name", "level", "searchPrefixes"].map(fieldPath => ({fieldPath}))},
          where: {fieldFilter: {field: {fieldPath: "country"}, op: "EQUAL", value: {stringValue: country}}},
          orderBy: [{field: {fieldPath: "__name__"}, direction: "ASCENDING"}], limit: 500,
          ...(after ? {startAt: {values: [{referenceValue: after}], before: false}} : {})};
        const response = await request(root + ":runQuery", {structuredQuery});
        const docs = response.filter(item => item.document).map(item => item.document);
        for (const doc of docs) {
          if (doc.fields?.level?.stringValue !== selectedLevel) continue;
          result.push({id: doc.name.split("/").pop(), path: doc.name, name: doc.fields?.name?.stringValue,
            searchPrefixes: doc.fields?.searchPrefixes?.arrayValue?.values?.map(value => value.stringValue)
              ?? (doc.fields?.searchPrefixes?.arrayValue ? [] : undefined), _updateTime: doc.updateTime});
        }
        after = docs.length === 500 ? docs.at(-1).name : null;
      } while (after);
      return result;
    },
    async updateBatch(records) {
      if (!records.length || records.length > 200) throw new Error("Backfill batches require 1–200 schools.");
      const writes = records.map(record => {
        if (!record.id || record.id.includes("/") || record.path !== `${database}/schools/${record.id}` || !record.updateTime) throw new Error("Invalid backfill record reference.");
        return {update: {name: record.path, fields: {searchPrefixes: {arrayValue: {values: record.searchPrefixes.map(stringValue => ({stringValue}))}}}},
          updateMask: {fieldPaths: ["searchPrefixes"]}, currentDocument: {updateTime: record.updateTime}};
      });
      // A concurrent rename fails the batch, including the stale prefixes.
      // Rerunning reads current names and skips already-correct documents.
      await request(root + ":commit", {writes});
    },
  };
}
async function applyBackfill(plan, store, progress = () => {}) {
  if (plan.invalid.length) throw new Error("Repair the invalid school names before applying the backfill.");
  let updated = 0;
  for (let offset = 0; offset < plan.changes.length; offset += 200) {
    const batch = plan.changes.slice(offset, offset + 200);
    await store.updateBatch(batch); updated += batch.length; progress(updated);
  }
  return updated;
}
async function main(args) {
  const input = {apply: false};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--apply") input.apply = true;
    else if (["--country", "--level", "--report"].includes(flag) && args[index + 1]) input[flag.slice(2)] = args[++index];
    else throw new Error("Usage: node scripts/backfill-school-search-prefixes.cjs --country COUNTRY --level LEVEL --report REPORT.json [--apply]");
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error("The production command cannot use emulator settings.");
  const country = text(input.country, "country"), selectedLevel = level(input.level);
  if (!input.report) throw new Error("Specify an output report path.");
  const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "null");
  if (!credentials || credentials.project_id !== "readyherox" || !credentials.client_email) throw new Error("Configured readyherox credentials are required.");
  const {createRequire} = require("node:module"), {GoogleAuth} = createRequire(path.resolve(__dirname, "../../.rhx-tools/package.json"))("google-auth-library");
  const client = await new GoogleAuth({credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"]}).getClient();
  const store = createSearchPrefixStore({project: "readyherox", country, selectedLevel,
    request: async (url, data) => (await client.request({url, data, method: "POST", timeout: 60000, retry: false})).data});
  const plan = prepareBackfill(await store.read());
  const report = {project: "readyherox", country, level: selectedLevel, startedAt: new Date().toISOString(), status: "planned",
    summary: plan.summary, schoolIds: plan.changes.map(record => record.id), invalid: plan.invalid, updated: 0};
  const save = () => {fs.mkdirSync(path.dirname(path.resolve(input.report)), {recursive: true}); fs.writeFileSync(input.report, JSON.stringify(report, null, 2) + "\n");};
  save(); console.log(JSON.stringify({dryRun: !input.apply, ...plan.summary}));
  if (!input.apply) {if (plan.invalid.length) process.exitCode = 1; return;}
  try {
    report.status = "running"; save();
    report.updated = await applyBackfill(plan, store, updated => {
      report.updated = updated; save();
      if (updated % 1000 === 0 || updated === plan.changes.length) console.log(JSON.stringify({updated, total: plan.changes.length}));
    });
    const verification = prepareBackfill(await store.read());
    if (verification.changes.length || verification.invalid.length) throw new Error("Verification found schools whose search prefixes need another pass. Rerun the preview.");
    report.status = "complete"; report.verifiedSchools = verification.summary.ready; report.completedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({status: report.status, updated: report.updated, verifiedSchools: report.verifiedSchools}));
  } catch (error) {
    report.status = "interrupted"; report.error = {code: error.code || null, status: error.response?.status || null, message: "Backfill did not finish. Rerun the preview against current records."}; save();
    throw error;
  }
}
module.exports = {prepareBackfill, createSearchPrefixStore, applyBackfill};
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(JSON.stringify({backfillFailed: true, status: error.response?.status || null, code: error.code || null,
    message: error.response ? "The backend rejected the request. Rerun the preview to inspect current records." : error.message}));
  process.exitCode = 1;
});
