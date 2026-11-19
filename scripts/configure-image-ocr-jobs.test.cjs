const assert = require("node:assert/strict");
const {test} = require("node:test");
const {configureOcrJobs, getSetupOptions} = require("./configure-image-ocr-jobs.cjs");

function harness(metadata, {projectId = "readyherox", projectNumber = "788606405643", undeployed = false, existingIam} = {}) {
  const calls = [], policy = {bindings: [{role: "roles/storage.objectViewer", members: ["group:ops@example.com"], condition: {expression: "true"}}], etag: "etag", version: 3};
  const storage = {get: async (path, options) => {
    if (path.endsWith("/iam")) {assert.equal(options.queryParams.optionsRequestedPolicyVersion, 3); return {body: structuredClone(existingIam || policy)};}
    if (metadata) return {body: metadata};
    throw Object.assign(new Error("Missing"), {status: 404});
  }, post: async (path, body, options) => {calls.push(["post", path, body, options]); return {body: {projectNumber, location: "US-CENTRAL1"}};},
  patch: async (...args) => calls.push(["patch", ...args]), put: async (...args) => calls.push(["put", ...args])};
  const reads = [];
  const functions = {get: async resource => {
    reads.push(resource);
    assert.ok(resource.startsWith(`projects/${projectId}/locations/us-central1/functions/`));
    if (undeployed) throw Object.assign(new Error("Not yet deployed"), {status: 404});
    const name = resource.endsWith("/processImageOcrJob") ? "worker" : "gateway";
    return {body: {serviceConfig: {serviceAccountEmail: `${name}@${projectId}.iam.gserviceaccount.com`}}};
  }};
  const projects = {get: async resource => {
    assert.equal(resource, `projects/${projectId}`);
    return {body: {projectId, projectNumber, lifecycleState: "ACTIVE"}};
  }};
  return {storage, functions, projects, projectId, bucketName: `${projectId}-ocr-jobs`, calls, reads, policy};
}

for (const projectId of ["readyherox", "rhx-staging"]) {
 test(`${projectId}: setup creates private storage in the selected project and preserves conditional IAM bindings`, async () => {
  const projectNumber = projectId === "readyherox" ? "788606405643" : "123456789012";
  const h = harness(undefined, {projectId, projectNumber});
  const result = await configureOcrJobs(h);
  assert.equal(result.runtimeAccountsConfigured, 3);
  assert.equal(result.bucketCreated, true);
  assert.equal(result.iamUpdated, true);
  const create = h.calls[0][2];
  assert.equal(h.calls[0][3].queryParams.project, projectId);
  assert.equal(create.name, `${projectId}-ocr-jobs`);
  assert.equal(create.location, "us-central1");
  assert.equal(create.iamConfiguration.publicAccessPrevention, "enforced");
  assert.equal(create.softDeletePolicy.retentionDurationSeconds, "0");
  assert.equal(create.lifecycle.rule[0].condition.age, 1);
  const iam = h.calls[1][2];
  assert.deepEqual(iam.bindings[0], h.policy.bindings[0]); assert.equal(iam.etag, "etag");
  assert.equal(iam.bindings.length, 3); assert.equal(iam.bindings[1].members.length, 3);
  assert.ok(iam.bindings[1].members.includes(`serviceAccount:worker@${projectId}.iam.gserviceaccount.com`));
  assert.ok(iam.bindings[1].members.includes(`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`));
 });
}

test("setup is limited to the dedicated bucket in the expected project and region", async () => {
  for (const metadata of [{projectNumber: "another", location: "US-CENTRAL1"}, {projectNumber: "788606405643", location: "US"},
    {projectNumber: "788606405643", location: "US-CENTRAL1", retentionPolicy: {retentionPeriod: "86400"}}]) {
    const h = harness(metadata);
    await assert.rejects(() => configureOcrJobs(h), /another project or region|retention policy/);
    assert.equal(h.calls.length, 0);
  }
  const h = harness({projectNumber: "788606405643", location: "US-CENTRAL1"});
  await configureOcrJobs(h);
  assert.equal(h.calls[0][0], "patch"); assert.equal(h.calls[0][1], "b/readyherox-ocr-jobs");
});

test("staging cannot reconfigure production's bucket even if its name is passed explicitly", async () => {
  const h = harness({projectNumber: "788606405643", location: "US-CENTRAL1"},
    {projectId: "rhx-staging", projectNumber: "123456789012"});
  h.bucketName = "readyherox-ocr-jobs";
  await assert.rejects(() => configureOcrJobs(h), /another project or region/);
  assert.equal(h.calls.length, 0);
});

test("a compliant bucket and existing runtime grants do not cause any writes", async () => {
  const accounts = ["788606405643-compute@developer.gserviceaccount.com", "gateway@readyherox.iam.gserviceaccount.com", "worker@readyherox.iam.gserviceaccount.com"];
  const existingIam = {etag: "etag", version: 3, bindings: ["roles/storage.objectAdmin", "roles/storage.legacyBucketReader"].map(role =>
    ({role, members: accounts.map(account => `serviceAccount:${account}`)}))};
  const metadata = {projectNumber: "788606405643", location: "US-CENTRAL1",
    iamConfiguration: {uniformBucketLevelAccess: {enabled: true}, publicAccessPrevention: "enforced"},
    lifecycle: {rule: [{action: {type: "Delete"}, condition: {age: 1}}]},
    versioning: {enabled: false}, softDeletePolicy: {retentionDurationSeconds: "0"}};
  const h = harness(metadata, {existingIam});
  const result = await configureOcrJobs(h);
  assert.equal(result.bucketCreated, false);
  assert.equal(result.policyUpdated, false);
  assert.equal(result.iamUpdated, false);
  assert.deepEqual(h.calls, []);
});

test("initial staging setup can grant the default runtime account before either function exists", async () => {
  const h = harness(undefined, {projectId: "rhx-staging", projectNumber: "123456789012", undeployed: true});
  const result = await configureOcrJobs(h);
  assert.equal(result.runtimeAccountsConfigured, 1);
  assert.deepEqual(h.calls[1][2].bindings[1].members, ["serviceAccount:123456789012-compute@developer.gserviceaccount.com"]);
});

test("missing configuration and unverified project identity stop setup before storage writes", async () => {
  for (const patch of [{projectId: undefined}, {bucketName: undefined}, {bucketName: "gs://readyherox-ocr-jobs"}]) {
    const h = harness();
    await assert.rejects(() => configureOcrJobs({...h, ...patch}), /explicit|IMAGE_OCR_JOBS_BUCKET/);
    assert.deepEqual(h.calls, []);
  }
  const h = harness();
  h.projects.get = async () => ({body: {projectId: "different-project", projectNumber: "788606405643", lifecycleState: "ACTIVE"}});
  await assert.rejects(() => configureOcrJobs(h), /Cannot verify/);
  assert.deepEqual(h.calls, []);
});

test("CLI requires a project and reads only that project's bucket setting", () => {
  assert.throws(() => getSetupOptions([]), /explicit valid Firebase project/);
  assert.throws(() => getSetupOptions(["--project", "../readyherox"]), /explicit valid Firebase project/);
  for (const projectId of ["readyherox", "rhx-staging"]) {
    assert.deepEqual(getSetupOptions(["--project", projectId]), {projectId, bucketName: `${projectId}-ocr-jobs`});
  }
  assert.deepEqual(getSetupOptions(["--project", "rhx-staging", "--bucket", "rhx-staging-custom-ocr-jobs"]),
    {projectId: "rhx-staging", bucketName: "rhx-staging-custom-ocr-jobs"});
});
