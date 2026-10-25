const assert = require("node:assert/strict");
const {test} = require("node:test");
const {configureOcrJobs} = require("./configure-image-ocr-jobs.cjs");

function harness(metadata) {
  const calls = [], policy = {bindings: [{role: "roles/storage.objectViewer", members: ["group:ops@example.com"], condition: {expression: "true"}}], etag: "etag", version: 3};
  const storage = {get: async (path, options) => {
    if (path.endsWith("/iam")) {assert.equal(options.queryParams.optionsRequestedPolicyVersion, 3); return {body: structuredClone(policy)};}
    if (metadata) return {body: metadata};
    throw Object.assign(new Error("Missing"), {status: 404});
  }, post: async (path, body, options) => {calls.push(["post", path, body, options]); return {body: {projectNumber: "788606405643"}};},
  patch: async (...args) => calls.push(["patch", ...args]), put: async (...args) => calls.push(["put", ...args])};
  const functions = {get: async () => ({body: {serviceConfig: {serviceAccountEmail: "gateway@readyherox.iam.gserviceaccount.com"}}})};
  return {storage, functions, calls, policy};
}
test("setup creates a private temporary bucket and preserves conditional IAM bindings", async () => {
  const h = harness();
  const result = await configureOcrJobs(h);
  assert.equal(result.runtimeAccountsConfigured, 2);
  const create = h.calls[0][2];
  assert.equal(h.calls[0][3].queryParams.project, "readyherox");
  assert.equal(create.location, "us-central1");
  assert.equal(create.iamConfiguration.publicAccessPrevention, "enforced");
  assert.equal(create.softDeletePolicy.retentionDurationSeconds, "0");
  assert.equal(create.lifecycle.rule[0].condition.age, 1);
  const iam = h.calls[1][2];
  assert.deepEqual(iam.bindings[0], h.policy.bindings[0]); assert.equal(iam.etag, "etag");
  assert.equal(iam.bindings.length, 3); assert.equal(iam.bindings[1].members.length, 2);
});
test("setup is limited to the dedicated bucket in the expected project and region", async () => {
  for (const metadata of [{projectNumber: "another", location: "US-CENTRAL1"}, {projectNumber: "788606405643", location: "US"}]) {
    const h = harness(metadata);
    await assert.rejects(() => configureOcrJobs(h), /another project or region/);
    assert.equal(h.calls.length, 0);
  }
  const h = harness({projectNumber: "788606405643", location: "US-CENTRAL1"});
  await configureOcrJobs(h);
  assert.equal(h.calls[0][0], "patch"); assert.equal(h.calls[0][1], "b/readyherox-ocr-jobs");
});
