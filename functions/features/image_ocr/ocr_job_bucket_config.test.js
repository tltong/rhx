const assert = require("node:assert/strict");
const {test, afterEach} = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {parseEnv} = require("node:util");
const {getOcrJobsBucket, StorageOcrJobRepository} = require("./infrastructure/storage_ocr_job_repository");
const {processImageOcrJob} = require("../../image_ocr_jobs_trigger");
const names = ["IMAGE_OCR_JOBS_BUCKET", "GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"];
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
afterEach(() => {
  for (const name of names) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
});

test("runtime storage and the worker trigger use each project's explicit bucket setting", () => {
  const trigger = processImageOcrJob.__endpoint.eventTrigger;
  assert.equal(trigger.eventFilters.bucket.name, "IMAGE_OCR_JOBS_BUCKET");
  for (const project of ["readyherox", "rhx-staging"]) {
    const configuration = parseEnv(fs.readFileSync(path.join(__dirname, `../../.env.${project}`), "utf8"));
    process.env.IMAGE_OCR_JOBS_BUCKET = configuration.IMAGE_OCR_JOBS_BUCKET;
    process.env.GCLOUD_PROJECT = project === "readyherox" ? "rhx-staging" : "readyherox";
    assert.equal(getOcrJobsBucket(), `${project}-ocr-jobs`);
    assert.equal(trigger.eventFilters.bucket.value(), getOcrJobsBucket());
  }
});

test("missing or invalid bucket configuration never falls back to project metadata or production", () => {
  process.env.GCLOUD_PROJECT = "readyherox";
  process.env.GOOGLE_CLOUD_PROJECT = "rhx-staging";
  for (const value of [undefined, "", " ", "gs://readyherox-ocr-jobs", "readyherox.firebasestorage.app",
    "some-other-bucket", "UPPERCASE-ocr-jobs", "x".repeat(64) + "-ocr-jobs"]) {
    if (value === undefined) delete process.env.IMAGE_OCR_JOBS_BUCKET;
    else process.env.IMAGE_OCR_JOBS_BUCKET = value;
    assert.throws(getOcrJobsBucket, error => error.code === "ocr-unavailable" && error.status === 503);
  }
});

test("a missing bucket setting fails before initializing a storage client", async () => {
  delete process.env.IMAGE_OCR_JOBS_BUCKET;
  await assert.rejects(() => new StorageOcrJobRepository().read("state.json"), error =>
    error.code === "ocr-unavailable" && error.status === 503);
});
