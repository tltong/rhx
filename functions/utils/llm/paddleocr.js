const {GoogleAuth} = require("google-auth-library");
const {normalizeOcrImage} = require("./image_ocr_settings");
const {ocrFailure, parseOcrResult} = require("./image_ocr_result");

const PADDLEOCR_MODEL = "PP-OCRv6_medium";
const DEFAULT_PADDLEOCR_URL = "https://extractpaddleocrtext-xzfajdpwha-uc.a.run.app";

class PaddleOcrUtil {
  constructor({getEndpoint = () => process.env.PADDLEOCR_URL || DEFAULT_PADDLEOCR_URL,
    createClient = url => new GoogleAuth().getIdTokenClient(url)} = {}) {
    Object.assign(this, {getEndpoint, createClient});
    this.clients = new Map();
  }

  async extractTextFromImage(input, {timeoutMs = 240000, signal} = {}) {
    const image = normalizeOcrImage(input.image);
    const model = input.model ?? PADDLEOCR_MODEL;
    const languageHint = input.languageHint ?? "auto";
    if (model !== PADDLEOCR_MODEL || typeof languageHint !== "string" || !languageHint.trim() || languageHint.length > 200) {
      throw ocrFailure("Provide a supported PaddleOCR model and language hint.", "invalid-argument", 400);
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 240000) {
      throw ocrFailure("OCR timeout must be between 1 and 240000 milliseconds.", "invalid-argument", 400);
    }
    signal?.throwIfAborted();
    const endpoint = this.getEndpoint();
    let url;
    try {url = new URL(endpoint);} catch {throw ocrFailure("PaddleOCR endpoint is not configured.", "ocr-unavailable", 503);}
    if (url.protocol !== "https:" || !url.hostname.endsWith(".run.app") || url.username || url.password ||
      url.port || url.search || url.hash || url.pathname !== "/") {
      throw ocrFailure("Configure the private PaddleOCR Cloud Run URL.", "ocr-unavailable", 503);
    }
    const controller = new AbortController();
    let timer, abort;
    const cancelled = new Promise((resolve, reject) => {
      abort = () => {
        const error = signal.reason || new DOMException("Cancelled", "AbortError");
        controller.abort(error); reject(error);
      };
      signal?.addEventListener("abort", abort, {once: true});
      timer = setTimeout(() => {
        const error = ocrFailure("OCR took too long. Check before starting another request.", "ocr-timeout", 504);
        controller.abort(error); reject(error);
      }, timeoutMs);
    });
    const startedAt = Date.now();
    const execute = async () => {
      controller.signal.throwIfAborted();
      if (!this.clients.has(endpoint)) {
        const pending = Promise.resolve().then(() => this.createClient(endpoint));
        this.clients.set(endpoint, pending);
        pending.catch(() => {if (this.clients.get(endpoint) === pending) this.clients.delete(endpoint);});
      }
      const client = await this.clients.get(endpoint);
      controller.signal.throwIfAborted();
      const headers = await client.getRequestHeaders(endpoint);
      controller.signal.throwIfAborted();
      // Use the authenticated headers with the SDK transport directly. This avoids
      // replaying an OCR request through the auth client's 401/403 retry behavior.
      const response = await client.transporter.request({
        url: endpoint, method: "POST", headers: {...headers, "Content-Type": "application/json"},
        data: {image, model, languageHint: languageHint.trim()}, responseType: "json",
        signal: controller.signal, timeout: Math.max(1, timeoutMs - (Date.now() - startedAt)),
        retry: false, maxRedirects: 0, size: 4 * 1024 * 1024,
      });
      controller.signal.throwIfAborted();
      if (response.data?.provider !== "paddleocr" || response.data?.model !== PADDLEOCR_MODEL) {
        throw ocrFailure("PaddleOCR returned an invalid provider or model.");
      }
      return parseOcrResult(JSON.stringify(response.data), "paddleocr", model);
    };
    try {
      return await Promise.race([cancelled, execute()]);
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (["invalid-argument", "ocr-invalid-response"].includes(error.code)) throw error;
      if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED" || error.response?.status === 504) {
        throw ocrFailure("OCR took too long. Check before starting another request.", "ocr-timeout", 504);
      }
      if (error.response?.status === 429) throw ocrFailure("PaddleOCR is busy. Try again later.", "ocr-unavailable", 429);
      throw ocrFailure("PaddleOCR is unavailable. Check its configuration and invocation permissions.", "ocr-unavailable", 503);
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
    }
  }
}

const paddleOcrUtil = new PaddleOcrUtil();
module.exports = {PaddleOcrUtil, paddleOcrUtil, PADDLEOCR_MODEL, DEFAULT_PADDLEOCR_URL};
