import {getCurrentFirebaseAuthRawUser} from "../firebase/firebase_auth.js";
import {getHttpFunctionUrl} from "../firebase/function_url.js?v=20261021-image-generation-v1";
import {ImageOcrJobsClient} from "./image_ocr_jobs_client.js?v=20261025-ocr-jobs-v1";

export class ImageOcrClient {
  constructor({endpointUrl, fetchImpl = (...args) => globalThis.fetch(...args), getUser = getCurrentFirebaseAuthRawUser, now = () => Date.now(), ...urlOptions} = {}) {
    Object.assign(this, {endpointUrl, fetchImpl, getUser, now, urlOptions});
    this.jobs = new ImageOcrJobsClient({transport: this, getUser, now});
  }
  requestJob(operation, input, options) {return this.jobs.run(operation, input, options);}
  resumeJob(jobId, options) {return this.jobs.resume(jobId, options);}
  getPendingJob() {return this.jobs.getPendingJob();}
  async request(action, input, {signal, timeoutMs = ["extract", "test"].includes(action) ? 270000 : 30000} = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 270000) throw new Error("OCR timeout must be between 1 and 270000 milliseconds.");
    const endpoint = this.endpointUrl || getHttpFunctionUrl("extractLlmImageText", this.urlOptions);
    const url = new URL(endpoint, globalThis.location?.href || "https://readyherox.web.app");
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("OCR requires an HTTPS endpoint outside the local emulator.");
    const user = this.getUser();
    if (!user) throw Object.assign(new Error("Sign in before extracting image text."), {code: "unauthenticated"});
    const assertUser = () => {
      if (this.getUser()?.uid !== user.uid) throw Object.assign(new Error("The signed-in account changed. Reload this page."), {code: "unauthenticated"});
    };
    const controller = new AbortController();
    const startedAt = this.now();
    let timer, abort, phase = "authentication", httpStatus, requestId, httpResponseReceived = false;
    const cancelled = new Promise((resolve, reject) => {
      abort = () => {const error = signal.reason || new DOMException("Cancelled", "AbortError"); controller.abort(error); reject(error);};
      signal?.addEventListener("abort", abort, {once: true});
      if (signal?.aborted) abort();
      timer = setTimeout(() => {
        const error = Object.assign(new Error("The OCR request took too long. It may still be processing; check before trying again."), {code: "ocr-timeout"});
        controller.abort(error); reject(error);
      }, timeoutMs);
    });
    try {
      return await Promise.race([cancelled, (async () => {
        controller.signal.throwIfAborted();
        const token = await user.getIdToken();
        assertUser(); controller.signal.throwIfAborted();
        phase = "request";
        const response = await this.fetchImpl(endpoint, {method: "POST", redirect: "error",
          headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
          body: JSON.stringify({action, input}), signal: controller.signal});
        httpResponseReceived = true; httpStatus = response.status;
        requestId = response.headers?.get("X-Request-ID") || undefined;
        phase = "response";
        let payload;
        try {payload = await response.json();}
        catch {throw Object.assign(new Error("The OCR service returned an unreadable response. Check before retrying."), {code: "invalid-response", requestId: response.headers?.get("X-Request-ID")});}
        assertUser(); controller.signal.throwIfAborted();
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Object.assign(new Error("The OCR service returned an invalid response."), {code: "invalid-response"});
        phase = "service";
        if (!response.ok || payload.error) throw Object.assign(new Error(payload.error?.message || "The OCR request failed."), {
          code: payload.error?.code || "ocr-request-failed", status: response.status, requestId: payload.requestId || requestId});
        phase = "result";
        if (!Object.hasOwn(payload, "result")) throw Object.assign(new Error("The OCR response did not include a result."), {code: "invalid-response"});
        return payload.result;
      })()]);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error("The OCR request failed.");
      if (phase === "request" && failure.name === "TypeError" && !controller.signal.aborted && !failure.code) failure.code = "ocr-network-error";
      Object.assign(failure, {phase, elapsedMs: Math.max(0, this.now() - startedAt), startedAt, browserTimeoutMs: timeoutMs,
        endpointUrl: url.origin + url.pathname, httpResponseReceived, httpStatus,
        ...(typeof globalThis.navigator?.onLine === "boolean" ? {online: navigator.onLine} : {})});
      if (!failure.requestId && requestId) failure.requestId = requestId;
      throw failure;
    } finally {clearTimeout(timer); signal?.removeEventListener("abort", abort);}
  }
}
export const imageOcrClient = new ImageOcrClient();
