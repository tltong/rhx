import assert from "node:assert/strict";
import {test} from "node:test";
import {ImageOcrJobsClient} from "../../utils/llm/image_ocr_jobs_client.js";

const jobId = "a7c460f8-2f53-47c8-9cce-97bf16130c14";
const result = {text: "学生 தமிழ்", warnings: [], provider: "paddleocr", model: "PP-OCRv6_medium"};
const status = state => ({jobId, state, ...(state === "completed" ? {result} : {})});
const error = (code, status) => Object.assign(new Error(code), {code, status});
function harness(request) {
  const storage = new Map(), calls = [], progress = [];
  let clock = 1000, user = {uid: "admin"};
  const options = {getUser: () => user, now: () => clock, createId: () => jobId,
    getStorage: () => ({getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)}),
    wait: async ms => {clock += ms;}, transport: {request: async (...args) => {calls.push(args); return request(...args);}}};
  const client = new ImageOcrJobsClient(options);
  return {client, options, calls, storage, progress, onProgress: value => progress.push(value.state),
    setUser: value => {user = value;}, advance: ms => {clock += ms;}};
}
test("a lost submission response and interrupted status check recover without uploading the image twice", async () => {
  let polls = 0;
  const h = harness(async action => {
    if (action === "startJob") throw error("ocr-network-error");
    if (++polls === 1) throw error("ocr-network-error");
    return status(polls === 2 ? "processing" : "completed");
  });
  assert.deepEqual(await h.client.run("test", {image: "private-image", language: "Chinese"}, {onProgress: h.onProgress}), result);
  assert.equal(h.calls.filter(([action]) => action === "startJob").length, 1);
  assert.equal(h.calls.filter(([action]) => action === "getJob").length, 3);
  assert.ok(h.progress.includes("reconnecting")); assert.ok(h.progress.includes("processing"));
  assert.equal(h.client.getPendingJob(), null);
  assert.equal(h.calls.every(([, , options]) => options.timeoutMs === 20000), true);
});
test("reload resumes the same job with owner-scoped metadata and no persisted image or result", async () => {
  const h = harness(async () => {throw error("permission-denied", 403);});
  await assert.rejects(() => h.client.run("extract", {image: "PRIVATE_IMAGE", language: "Tamil"}), {jobId});
  // A rejected submission is not kept when authorization definitively failed.
  assert.equal(h.client.getPendingJob(), null);
  h.options.transport.request = async action => {
    if (action === "startJob") return status("queued");
    throw error("unauthenticated", 401);
  };
  await assert.rejects(() => h.client.run("extract", {image: "PRIVATE_IMAGE", language: "Tamil"}), {jobId});
  const remembered = h.client.getPendingJob(); assert.equal(remembered.jobId, jobId);
  assert.equal(JSON.stringify([...h.storage]).includes("PRIVATE_IMAGE"), false);
  await assert.rejects(() => h.client.run("extract", {image: "another"}), {code: "ocr-job-pending"});
  const reloaded = new ImageOcrJobsClient({...h.options, transport: {request: async (action, input) => {
    assert.equal(action, "getJob"); assert.deepEqual(input, {jobId}); return status("completed");
  }}});
  assert.equal(reloaded.getPendingJob().jobId, jobId);
  h.setUser({uid: "other"}); assert.equal(reloaded.getPendingJob(), null);
  h.setUser({uid: "admin"}); assert.deepEqual(await reloaded.resume(jobId), result);
  assert.equal(reloaded.getPendingJob(), null);
});
test("server failure and expiration are terminal and never cause a new submission", async () => {
  for (const expired of [false, true]) {
    let calls = 0;
    const h = harness(async () => {
      if (++calls === 1) return status("queued");
      if (expired) throw error("ocr-job-expired", 410);
      return {...status("failed"), error: {code: "ocr-failed", message: "Provider failed."}};
    });
    await assert.rejects(() => h.client.run("test", {}), {code: expired ? "ocr-job-expired" : "ocr-failed", jobId});
    assert.equal(h.client.getPendingJob(), null); assert.equal(calls, 2);
  }
});
test("unconfirmed submissions retain their job ID rather than starting recognition again", async () => {
  const h = harness(async action => {throw error(action === "startJob" ? "ocr-network-error" : "ocr-job-not-found", 404);});
  await assert.rejects(() => h.client.run("extract", {}), {code: "ocr-job-submission-unknown", jobId});
  assert.equal(h.calls.filter(([action]) => action === "startJob").length, 1);
  assert.equal(h.client.getPendingJob().jobId, jobId);
});
test("account changes cannot expose a stored result or submit another image", async () => {
  const h = harness(async () => {h.setUser({uid: "other"}); return status("completed");});
  await assert.rejects(() => h.client.run("test", {}), {code: "unauthenticated", jobId});
  assert.equal(h.calls.length, 1); assert.equal(h.client.getPendingJob(), null);
});
test("cancellation before submission and invalid wait limits send nothing", async () => {
  const h = harness(async () => {throw new Error("Must not send");});
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => h.client.run("extract", {}, {signal: controller.signal}), {name: "AbortError"});
  await assert.rejects(() => h.client.run("extract", {}, {timeoutMs: -1}), {code: "invalid-argument"});
  assert.equal(h.client.getPendingJob(), null); assert.equal(h.calls.length, 0);
});
test("cancelling an active wait preserves the job for later retrieval", async () => {
  const h = harness(async action => {
    assert.equal(action, "startJob"); return status("queued");
  });
  h.client.wait = (ms, signal) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), {once: true}));
  const controller = new AbortController();
  const pending = h.client.run("extract", {}, {signal: controller.signal});
  await new Promise(setImmediate); controller.abort();
  await assert.rejects(() => pending, {name: "AbortError", jobId});
  assert.equal(h.client.getPendingJob().jobId, jobId); assert.equal(h.calls.length, 1);
});
test("expired browser recovery metadata does not permanently block new extraction", async () => {
  const h = harness(async action => {
    if (action === "startJob") return status("queued");
    throw error("unauthenticated", 401);
  });
  await assert.rejects(() => h.client.run("extract", {}), {code: "unauthenticated"});
  assert.equal(h.client.getPendingJob().jobId, jobId);
  h.advance(900000);
  assert.equal(h.client.getPendingJob(), null);
  assert.equal(h.storage.size, 0);
});
