const {createHash, randomUUID} = require("node:crypto");
const {extractLlmImageText} = require("../../../utils/llm/llm_util");
const {ocrFailure, parseOcrResult} = require("../../../utils/llm/image_ocr_result");
const {StorageOcrJobRepository} = require("../infrastructure/storage_ocr_job_repository");

const JOB_LIFETIME_MS = 15 * 60 * 1000;
const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INPUT_PATH = /^jobs\/[0-9a-f]{64}\/[0-9a-f-]{36}\/input\.json$/;
const digest = value => createHash("sha256").update(value).digest("hex");
function jobPrefix(uid, jobId) {
  if (typeof uid !== "string" || !uid) throw ocrFailure("Sign in before checking OCR jobs.", "unauthenticated", 401);
  if (typeof jobId !== "string" || !JOB_ID.test(jobId)) throw ocrFailure("Provide a valid OCR job ID.", "invalid-argument", 400);
  return `jobs/${digest(uid)}/${jobId}/`;
}
function safeJobError(error) {
  if (error.code === "ocr-timeout") return {code: "ocr-timeout", message: "OCR exceeded its processing deadline. The image was not automatically resubmitted."};
  if (error.status === 429) return {code: "ocr-unavailable", message: "The OCR provider is busy or its quota has been reached."};
  return {code: "ocr-failed", message: "OCR could not be completed. Use the job ID to check the function logs before starting another extraction."};
}
function createOcrJobs({repository = new StorageOcrJobRepository(), prepare,
  extract = extractLlmImageText, now = () => Date.now(), log = require("firebase-functions/logger")} = {}) {
  function publicStatus(record) {
    const {jobId, state, provider, model, createdAt, expiresAt} = record;
    if (now() >= expiresAt) throw ocrFailure("This OCR job has expired. Start a new extraction.", "ocr-job-expired", 410);
    if (state === "processing" && now() > record.executionDeadlineAt) {
      return {jobId, state: "failed", provider, model, createdAt, expiresAt,
        error: {code: "ocr-job-interrupted", message: "The worker did not save a result before its deadline. Check the job ID in logs before submitting the image again."}};
    }
    return {jobId, state, provider, model, createdAt, expiresAt,
      ...(state === "completed" ? {result: record.result} : {}), ...(state === "failed" ? {error: record.error} : {})};
  }
  async function status({jobId}, {updatedBy} = {}) {
    const prefix = jobPrefix(updatedBy, jobId);
    const record = await repository.read(prefix + "state.json") || await repository.read(prefix + "input.json");
    if (!record) throw ocrFailure("This OCR job has not been found. Its submission may still be in progress.", "ocr-job-not-found", 404);
    return publicStatus(record.value);
  }
  async function start({jobId, operation, input}, context) {
    const prefix = jobPrefix(context?.updatedBy, jobId);
    if (!["extract", "test"].includes(operation)) throw ocrFailure("Choose extract or test for this OCR job.", "invalid-argument", 400);
    const fingerprint = digest(JSON.stringify({operation, input}));
    const existing = await repository.read(prefix + "state.json") || await repository.read(prefix + "input.json");
    if (existing) {
      if (existing.value.fingerprint !== fingerprint) throw ocrFailure("This job ID belongs to another OCR request.", "invalid-argument", 400);
      return publicStatus(existing.value);
    }
    const {request, timeoutMs} = await prepare(input, context, {operation});
    const createdAt = now();
    const record = {jobId, fingerprint, state: "queued", createdAt, expiresAt: createdAt + JOB_LIFETIME_MS,
      provider: request.provider, model: request.model, request, timeoutMs};
    // Only the first create finalizes an input object and schedules recognition.
    if (!await repository.write(prefix + "input.json", record)) {
      const winner = await repository.read(prefix + "state.json") || await repository.read(prefix + "input.json");
      if (!winner || winner.value.fingerprint !== fingerprint) throw ocrFailure("The OCR job ID is already in use.", "invalid-argument", 400);
      return publicStatus(winner.value);
    }
    return publicStatus(record);
  }
  async function processObject({name, generation}) {
    if (!INPUT_PATH.test(name || "")) return;
    const stateKey = name.replace(/input\.json$/, "state.json");
    if (await repository.read(stateKey)) {
      // A duplicate submission can recreate an input after the first was deleted.
      // The claimed worker already holds its input; never replay recognition.
      await repository.remove(name, generation); return;
    }
    const input = await repository.read(name, generation);
    if (!input) return;
    const {request, timeoutMs, ...record} = input.value;
    if (!JOB_ID.test(record.jobId) || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 240000 ||
      !["openai", "deepseek", "paddleocr", "sarvam"].includes(record.provider) || !request) throw new Error("Invalid stored OCR job.");
    if (now() >= record.expiresAt) {await repository.remove(name, input.generation); return;}
    const remainingMs = Math.max(1, Math.min(timeoutMs, record.expiresAt - now()));
    const claimToken = randomUUID();
    const processing = {...record, claimToken, state: "processing", executionDeadlineAt: Math.min(record.expiresAt, now() + remainingMs + 60000)};
    await repository.write(stateKey, processing); // Atomic generation-zero claim.
    const claim = await repository.read(stateKey);
    // A conditional upload retry can report 412 after its first write succeeded.
    // Only this invocation's token can authorize recognition, even in that case.
    if (claim?.value.claimToken !== claimToken) return;
    try {
      const {provider, ...providerInput} = request;
      const raw = await extract(providerInput, {provider, timeoutMs: remainingMs});
      const result = parseOcrResult(JSON.stringify(raw), provider, request.model);
      // Keep status reads bounded independently of Firestore's document limit.
      if (Buffer.byteLength(JSON.stringify(result)) > 4 * 1024 * 1024) throw new Error("OCR result exceeds its limit.");
      if (!await repository.write(stateKey, {...processing, state: "completed", result}, claim.generation)) throw new Error("OCR job state changed.");
      log.info("OCR job completed", {jobId: record.jobId, provider, elapsedMs: now() - processing.createdAt});
    } catch (error) {
      const providerJobId = typeof error.providerJobId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(error.providerJobId) ? error.providerJobId : undefined;
      log.error("OCR job failed", {jobId: record.jobId, code: safeJobError(error).code, ...(providerJobId ? {providerJobId} : {})});
      await repository.write(stateKey, {...processing, state: "failed", error: safeJobError(error)}, claim.generation);
    } finally {
      try {await repository.remove(name, input.generation);}
      catch {log.error("OCR input cleanup deferred to bucket lifecycle", {jobId: record.jobId});}
    }
  }
  return {start, status, processObject};
}
module.exports = {createOcrJobs, JOB_LIFETIME_MS, jobPrefix};
