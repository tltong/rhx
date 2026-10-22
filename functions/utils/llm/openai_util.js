const OpenAI = require("openai");
const {defineSecret} = require("firebase-functions/params");
const {normalizeImageSettings} = require("./image_generation_settings");
const {extractOpenAIImageText} = require("./openai_ocr");
const openaiApiKey = defineSecret("OPENAI_API_KEY");
const IMAGE_GENERATION_TIMEOUT_MS = 240000;

class OpenAIUtil {
  constructor({createClient = () => new OpenAI({apiKey: openaiApiKey.value(),
    timeout: IMAGE_GENERATION_TIMEOUT_MS, maxRetries: 0})} = {}) {this.createClient = createClient;}
  extractTextFromImage(input, options = {}) {return extractOpenAIImageText(input, {...options, createClient: this.createClient});}
  // Settings are resolved by the image_generation feature before this call.
  async generateImage(input, {timeoutMs = IMAGE_GENERATION_TIMEOUT_MS, signal} = {}) {
    const settings = normalizeImageSettings(input);
    if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 32000) {
      throw Object.assign(new Error("Provide an image prompt of 1–32,000 characters."), {code: "invalid-argument"});
    }
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener("abort", abort, {once: true});
    let timer;
    const deadline = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        const error = Object.assign(new Error("Image generation took too long. Check before starting another request."), {code: "image-timeout", status: 504});
        controller.abort(error); reject(error);
      }, Math.max(1, Math.min(Number(timeoutMs) || IMAGE_GENERATION_TIMEOUT_MS, IMAGE_GENERATION_TIMEOUT_MS)));
    });
    try {
      if (signal?.aborted) abort();
      controller.signal.throwIfAborted();
      const response = await Promise.race([this.createClient().images.generate({model: settings.model,
        prompt: input.prompt.trim(), size: settings.size, quality: settings.quality,
        background: settings.transparentBackground ? "transparent" : "opaque", output_format: "png", n: 1},
      {signal: controller.signal}), deadline]);
      controller.signal.throwIfAborted();
      const base64 = response?.data?.[0]?.b64_json;
      if (typeof base64 !== "string" || !base64.length) throw Object.assign(new Error("The image service returned no image."), {code: "image-empty-response", status: 502});
      return {model: settings.model, settings, images: [{mimeType: "image/png", base64}], usage: response.usage || null};
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (error.name === "APIConnectionTimeoutError") throw Object.assign(new Error("Image generation took too long. Check before starting another request."), {code: "image-timeout", status: 504});
      throw error;
    } finally {clearTimeout(timer); signal?.removeEventListener("abort", abort);}
  }
}
const openaiUtil = new OpenAIUtil();
module.exports = {OpenAIUtil, openaiUtil, openaiApiKey, IMAGE_GENERATION_TIMEOUT_MS};
