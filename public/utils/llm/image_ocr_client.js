import {getCurrentFirebaseAuthRawUser} from "../firebase/firebase_auth.js";
import {getHttpFunctionUrl} from "../firebase/function_url.js?v=20261021-image-generation-v1";

export class ImageOcrClient {
  constructor({endpointUrl, fetchImpl = (...args) => globalThis.fetch(...args), getUser = getCurrentFirebaseAuthRawUser, ...urlOptions} = {}) {
    Object.assign(this, {endpointUrl, fetchImpl, getUser, urlOptions});
  }
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
    let timer, abort;
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
        const response = await this.fetchImpl(endpoint, {method: "POST", redirect: "error",
          headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
          body: JSON.stringify({action, input}), signal: controller.signal});
        let payload;
        try {payload = await response.json();}
        catch {throw Object.assign(new Error("The OCR service returned an unreadable response. Check before retrying."), {code: "invalid-response", requestId: response.headers?.get("X-Request-ID")});}
        assertUser(); controller.signal.throwIfAborted();
        if (!response.ok || payload.error) throw Object.assign(new Error(payload.error?.message || "The OCR request failed."), {
          code: payload.error?.code || "ocr-request-failed", status: response.status, requestId: payload.requestId});
        if (!Object.hasOwn(payload, "result")) throw new Error("The OCR response did not include a result.");
        return payload.result;
      })()]);
    } finally {clearTimeout(timer); signal?.removeEventListener("abort", abort);}
  }
}
export const imageOcrClient = new ImageOcrClient();
