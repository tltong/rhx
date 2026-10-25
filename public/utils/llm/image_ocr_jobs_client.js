const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const transient = error => ["ocr-network-error", "ocr-timeout", "invalid-response"].includes(error.code) ||
  [408, 429, 500, 502, 503, 504].includes(error.status);
const failure = (message, code) => Object.assign(new Error(message), {code});
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {clearTimeout(timer); reject(signal.reason);};
    const timer = setTimeout(() => {signal.removeEventListener("abort", abort); resolve();}, ms);
    signal.addEventListener("abort", abort, {once: true});
  });
}
export class ImageOcrJobsClient {
  constructor({transport, getUser, now = () => Date.now(), wait = pause,
    createId = () => globalThis.crypto.randomUUID(), getStorage = () => globalThis.sessionStorage} = {}) {
    Object.assign(this, {transport, getUser, now, wait, createId, getStorage});
    this.pending = new Map(); this.running = new Set();
  }
  key(uid) {return `rhx.ocr.pending.${uid}`;}
  getPendingJob() {
    const uid = this.getUser()?.uid;
    if (!uid) return null;
    let record = this.pending.get(uid);
    try {
      const storage = this.getStorage();
      if (storage) record = JSON.parse(storage.getItem(this.key(uid)) || "null");
    } catch { /* Storage may be unavailable. */ }
    if (!JOB_ID.test(record?.jobId || "") || !Number.isFinite(record?.createdAt)) return null;
    if (this.now() - record.createdAt >= 900000) {this.remember(uid, null); return null;}
    return {...record};
  }
  remember(uid, record) {
    if (record) this.pending.set(uid, record); else this.pending.delete(uid);
    try {
      if (record) this.getStorage()?.setItem(this.key(uid), JSON.stringify(record));
      else this.getStorage()?.removeItem(this.key(uid));
    } catch { /* In-memory recovery still works when browser storage is blocked. */ }
  }
  async run(operation, input, options = {}) {
    const pending = this.getPendingJob();
    if (pending) throw Object.assign(failure("Check the previous OCR job before starting another extraction.", "ocr-job-pending"), {jobId: pending.jobId});
    const uid = this.getUser()?.uid;
    if (!uid) throw failure("Sign in before extracting image text.", "unauthenticated");
    const record = {jobId: this.createId(), createdAt: this.now(), language: input?.language, operation};
    return this.follow(record, {operation, input}, options);
  }
  async resume(jobId, options = {}) {
    if (!JOB_ID.test(jobId || "")) throw failure("Provide a valid OCR job ID.", "invalid-argument");
    return this.follow({jobId}, null, options);
  }
  async follow(record, submission, {signal, timeoutMs = 600000, onProgress = () => {}} = {}) {
    const uid = this.getUser()?.uid;
    if (!uid) throw failure("Sign in before checking OCR jobs.", "unauthenticated");
    const {jobId} = record;
    if (this.running.has(uid)) throw Object.assign(failure("An OCR job is already being checked.", "ocr-job-pending"), {jobId});
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 900000) throw failure("OCR job wait must be between 1 and 900000 milliseconds.", "invalid-argument");
    const assertUser = () => {
      if (this.getUser()?.uid !== uid) throw failure("The signed-in account changed. Reload this page.", "unauthenticated");
    };
    const controller = new AbortController(), startedAt = this.now();
    const abort = () => controller.abort(signal.reason || new DOMException("Cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, {once: true});
    if (signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(failure("Stopped waiting for OCR. Check the previous job to retrieve its result without sending the image again.", "ocr-timeout")), timeoutMs);
    this.running.add(uid);
    let job, disconnected = 0, phase = submission ? "submission" : "polling";
    const notify = state => {assertUser(); controller.signal.throwIfAborted(); onProgress({state, jobId, elapsedMs: this.now() - startedAt});};
    try {
      assertUser(); controller.signal.throwIfAborted();
      if (submission) {
        this.remember(uid, record);
        notify("submitting");
        try {job = await this.transport.request("startJob", {jobId, ...submission}, {signal: controller.signal, timeoutMs: 20000});}
        catch (error) {
          assertUser(); controller.signal.throwIfAborted();
          if (!transient(error)) {
            if ([400, 401, 403].includes(error.status) || error.code === "invalid-argument") this.remember(uid, null);
            throw error;
          }
          // Submission is never repeated: the server may already have stored it.
          notify("reconnecting");
        }
      }
      phase = "polling";
      for (;;) {
        assertUser(); controller.signal.throwIfAborted();
        if (job) {
          if (job.jobId !== jobId || !["queued", "processing", "completed", "failed"].includes(job.state)) throw failure("The OCR job returned an invalid status.", "invalid-response");
          notify(job.state);
          if (["completed", "failed"].includes(job.state)) {
            this.remember(uid, null);
            if (job.state === "failed") throw Object.assign(failure(job.error?.message || "OCR failed.", job.error?.code || "ocr-failed"), {jobState: "failed", provider: job.provider, model: job.model});
            if (typeof job.result?.text !== "string" || !Array.isArray(job.result?.warnings)) throw failure("The OCR job returned an invalid transcription.", "invalid-response");
            return job.result;
          }
          await this.wait(2000, controller.signal);
        }
        try {
          job = await this.transport.request("getJob", {jobId}, {signal: controller.signal, timeoutMs: 20000});
          disconnected = 0;
        } catch (error) {
          assertUser(); controller.signal.throwIfAborted();
          if (error.code === "ocr-job-expired") {this.remember(uid, null); throw error;}
          if (error.code === "ocr-job-not-found" && this.now() - startedAt >= 60000) {
            throw failure("The OCR submission could not be confirmed. Keep this job ID and check again before sending another image.", "ocr-job-submission-unknown");
          }
          if (!transient(error) && error.code !== "ocr-job-not-found") throw error;
          notify("reconnecting"); job = null;
          await this.wait(Math.min(2000 * 2 ** Math.min(disconnected++, 2), 8000), controller.signal);
        }
      }
    } catch (error) {
      const cause = controller.signal.aborted ? controller.signal.reason : error;
      throw Object.assign(cause instanceof Error ? cause : new Error("OCR failed."), {jobId, phase,
        startedAt, elapsedMs: Math.max(0, this.now() - startedAt), browserTimeoutMs: timeoutMs,
        jobPending: this.getPendingJob()?.jobId === jobId});
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", abort); this.running.delete(uid);
    }
  }
}
