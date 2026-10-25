const assert = require("node:assert/strict");
const {test} = require("node:test");
const {createOcrJobs, jobPrefix, JOB_LIFETIME_MS} = require("./application/image_ocr_jobs");
const {createImageOcrFeature} = require("./image_ocr_module");
const {createImageOcrHandler} = require("../../image_ocr_http");
const {DEFAULT_OCR_SETTINGS} = require("../../utils/llm/image_ocr_settings");
const {MemoryJobRepository} = require("./fixtures/memory_job_repository");
const {StorageOcrJobRepository} = require("./infrastructure/storage_ocr_job_repository");
const {EventEmitter} = require("node:events");
const jobId = "a7c460f8-2f53-47c8-9cce-97bf16130c14", context = {updatedBy: "admin"};
const image = {mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="};
const configuration = {...DEFAULT_OCR_SETTINGS, languageProviders: {chinese: "paddleocr"}};
const submission = {jobId, operation: "test", input: {image, language: "Chinese", configuration}};
function harness(options = {}) {
  const repository = new MemoryJobRepository(), calls = [], logs = [];
  let clock = 1000000;
  const feature = createImageOcrFeature({repository: {getConfig: async () => configuration},
    getUser: async uid => ({uid, email: uid + "@example.com", emailVerified: true}), checkAdmin: async email => email === "admin@example.com"});
  const jobs = createOcrJobs({repository, prepare: feature.prepareImageOcr,
    extract: async (input, opts) => {calls.push({input, opts}); return {text: "学生的原文", warnings: [], provider: opts.provider, model: input.model};},
    now: () => clock, log: {info: (message, data) => logs.push(data), error: (message, data) => logs.push(data)}, ...options});
  return {jobs, repository, calls, logs, feature, advance: ms => {clock += ms;}, object: () => ({name: jobPrefix("admin", jobId) + "input.json", generation: repository.objects.get(jobPrefix("admin", jobId) + "input.json")?.generation})};
}
test("submit snapshots the validated route; duplicate and concurrent events recognize once, then delete the image", async () => {
  const h = harness();
  const job = await h.jobs.start(submission, context);
  assert.equal(job.state, "queued"); assert.equal(job.provider, "paddleocr"); assert.equal(h.calls.length, 0);
  assert.equal(JSON.stringify(job).includes(image.base64), false);
  await Promise.all([h.jobs.processObject(h.object()), h.jobs.processObject(h.object())]);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].opts.timeoutMs, 240000);
  const done = await h.jobs.status({jobId}, context);
  assert.equal(done.state, "completed"); assert.equal(done.result.text, "学生的原文");
  assert.equal(await h.repository.read(h.object().name), null);
  assert.equal((await h.jobs.start(submission, context)).state, "completed");
  await h.jobs.processObject(h.object()); assert.equal(h.calls.length, 1);
  assert.equal(JSON.stringify(h.logs).includes(image.base64), false); assert.equal(JSON.stringify(h.logs).includes("学生的原文"), false);
});
test("job reads are owner-scoped and draft authorization, image limits, and operation validation precede writes", async () => {
  const h = harness();
  for (const invalid of [{...submission, operation: "toString"}, {...submission, jobId: "../input"}, {...submission, input: {...submission.input, image: {...image, base64: "bad"}}}]) {
    await assert.rejects(() => h.jobs.start(invalid, context), {code: "invalid-argument"});
  }
  await assert.rejects(() => h.jobs.start(submission, {updatedBy: "student"}), {code: "permission-denied"});
  assert.equal(h.repository.objects.size, 0);
  await h.jobs.start(submission, context);
  await assert.rejects(() => h.jobs.status({jobId}, {updatedBy: "student"}), {code: "ocr-job-not-found"});
  await assert.rejects(() => h.jobs.start({...submission, input: {...submission.input, language: "English"}}, context), {code: "invalid-argument"});
  assert.equal(h.repository.objects.size, 1);
});
test("worker errors are terminal, safe, and never resubmit a provider request", async () => {
  let calls = 0;
  const h = harness({extract: async () => {calls++; throw Object.assign(new Error("private key and image"), {code: "ocr-unavailable", providerJobId: "safe_job-1"});}});
  await h.jobs.start(submission, context); const object = h.object();
  await h.jobs.processObject(object); await h.jobs.processObject(object);
  const failed = await h.jobs.status({jobId}, context);
  assert.equal(failed.state, "failed"); assert.equal(calls, 1); assert.equal(h.logs[0].providerJobId, "safe_job-1");
  assert.equal(JSON.stringify(failed).includes("private"), false); assert.equal(await h.repository.read(object.name), null);
});
test("ambiguous claim writes recover and duplicate recreated inputs are removed without recognizing again", async () => {
  const h = harness();
  await h.jobs.start(submission, context);
  const object = h.object(), original = (await h.repository.read(object.name)).value;
  const write = h.repository.write.bind(h.repository);
  h.repository.write = async (key, value, generation = 0) => {
    const committed = await write(key, value, generation);
    return key.endsWith("state.json") && generation === 0 ? false : committed;
  };
  await h.jobs.processObject(object);
  assert.equal(h.calls.length, 1);
  await h.repository.write(object.name, original);
  await h.jobs.processObject(h.object());
  assert.equal(h.calls.length, 1); assert.equal(await h.repository.read(object.name), null);
});
test("stalled and expired jobs are bounded, and unrelated storage events cannot start OCR", async () => {
  const h = harness(); await h.jobs.start(submission, context);
  const prefix = jobPrefix("admin", jobId), record = (await h.repository.read(prefix + "input.json")).value;
  await h.repository.write(prefix + "state.json", {...record, state: "processing", executionDeadlineAt: 1000001});
  h.advance(2); assert.equal((await h.jobs.status({jobId}, context)).error.code, "ocr-job-interrupted");
  await h.jobs.processObject({name: prefix + "state.json"}); assert.equal(h.calls.length, 0);
  h.advance(JOB_LIFETIME_MS); await assert.rejects(() => h.jobs.status({jobId}, context), {code: "ocr-job-expired"});
});
test("committed jobs continue when the submission HTTP response disconnects", async () => {
  const h = harness();
  const handler = createImageOcrHandler({apis: h.feature, jobs: h.jobs, verifyToken: async () => ({uid: "admin"}), log: {info() {}, error() {}}});
  const req = Object.assign(new EventEmitter(), {method: "POST", headers: {authorization: "Bearer token"}, body: {action: "startJob", input: submission}});
  const res = Object.assign(new EventEmitter(), {writableEnded: false, set() {}, status() {return this;}, json() {}});
  h.repository.onCreate = () => res.emit("close");
  await handler(req, res);
  await h.jobs.processObject(h.object());
  assert.equal((await h.jobs.status({jobId}, context)).state, "completed"); assert.equal(h.calls.length, 1);
});
test("storage repository enforces privacy and retention and uses generation preconditions", async () => {
  let metadata = {iamConfiguration: {uniformBucketLevelAccess: {enabled: true}, publicAccessPrevention: "enforced"}, lifecycle: {rule: [{action: {type: "Delete"}, condition: {age: 1}}]}};
  const saves = [], downloads = [], deletes = [];
  const bucket = {name: "readyherox-ocr-jobs", getMetadata: async () => [metadata], file: (key, fileOptions) => ({
    getMetadata: async () => [{size: 16, generation: "5"}],
    download: async () => {downloads.push(fileOptions); return [Buffer.from('{"state":"queued"}')];},
    save: async (bytes, options) => {saves.push(options); throw Object.assign(new Error("Precondition"), {code: 412});},
    delete: async options => deletes.push({fileOptions, options}),
  })};
  const repo = new StorageOcrJobRepository({getBucket: () => bucket});
  assert.equal(await repo.write("state", {}), false); assert.equal(saves[0].preconditionOpts.ifGenerationMatch, 0);
  assert.equal((await repo.read("state")).value.state, "queued"); assert.deepEqual(downloads, [{generation: "5"}]);
  await repo.remove("input", "4"); assert.equal(deletes[0].fileOptions.preconditionOpts.ifGenerationMatch, "4");
  assert.equal(deletes[0].fileOptions.generation, "4"); assert.equal(deletes[0].options.ignoreNotFound, true);
  for (const invalid of [{...metadata, iamConfiguration: {}}, {...metadata, softDeletePolicy: {retentionDurationSeconds: "604800"}}, {...metadata, lifecycle: {rule: []}}, {...metadata, versioning: {enabled: true}}]) {
    metadata = invalid;
    await assert.rejects(() => new StorageOcrJobRepository({getBucket: () => bucket}).read("state"), {code: "ocr-unavailable"});
  }
});
