import {getCurrentFirebaseAuthRawUser} from "../firebase/firebase_auth.js";
import {getHttpFunctionUrl} from "../firebase/function_url.js?v=20261021-image-generation-v1";

export class ImageGenerationClient {
  constructor({endpointUrl, fetchImpl = (...args) => globalThis.fetch(...args),
    getUser = getCurrentFirebaseAuthRawUser, ...urlOptions} = {}) {
    Object.assign(this, {endpointUrl, fetchImpl, getUser, urlOptions});
  }
  async request(action, input, {signal, timeoutMs = action === "generate" ? 270000 : 30000} = {}) {
    const user = this.getUser();
    if (!user) throw Object.assign(new Error("Sign in before using image generation."), {code: "unauthenticated"});
    const controller = new AbortController();
    const assertUser = () => {
      if (this.getUser()?.uid !== user.uid) throw Object.assign(new Error("The signed-in account changed. Reload this page."), {code: "unauthenticated"});
    };
    let timer, onAbort;
    const cancelled = new Promise((resolve, reject) => {
      onAbort = () => {const error = signal.reason || new DOMException("Cancelled", "AbortError"); controller.abort(error); reject(error);};
      signal?.addEventListener("abort", onAbort, {once: true});
      if (signal?.aborted) onAbort();
      timer = setTimeout(() => {
        const error = Object.assign(new Error("The image request took too long. It may still be processing; check before generating again."), {code: "image-timeout"});
        controller.abort(error); reject(error);
      }, timeoutMs);
    });
    try {
      return await Promise.race([cancelled, (async () => {
        controller.signal.throwIfAborted();
        const token = await user.getIdToken();
        assertUser(); controller.signal.throwIfAborted();
        const response = await this.fetchImpl(this.endpointUrl || getHttpFunctionUrl("generateLlmImage", this.urlOptions), {
          method: "POST", headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
          body: JSON.stringify({action, input}), signal: controller.signal,
        });
        let payload;
        try {payload = await response.json();}
        catch {throw Object.assign(new Error("The image service returned an unreadable response. Check before retrying."), {code: "invalid-response", requestId: response.headers?.get("X-Request-ID")});}
        assertUser(); controller.signal.throwIfAborted();
        if (!response.ok || payload.error) throw Object.assign(new Error(payload.error?.message || "The image request failed."), {
          code: payload.error?.code || "image-request-failed", status: response.status, requestId: payload.requestId,
        });
        if (!Object.hasOwn(payload, "result")) throw new Error("The image response did not include a result.");
        return payload.result;
      })()]);
    } finally {clearTimeout(timer); signal?.removeEventListener("abort", onAbort);}
  }
}
export const imageGenerationClient = new ImageGenerationClient();
