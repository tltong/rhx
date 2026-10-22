const {normalizeOcrImage, OCR_MODELS_BY_PROVIDER, OCR_DETAILS} = require("./image_ocr_settings");
const {ocrFailure: failure, parseOcrResult} = require("./image_ocr_result");

async function extractOpenAIImageText(input, {createClient, timeoutMs = 240000, signal} = {}) {
  const image = normalizeOcrImage(input.image);
  if (!OCR_MODELS_BY_PROVIDER.openai.includes(input.model) || !OCR_DETAILS.includes(input.detail) ||
    typeof input.instructions !== "string" || !input.instructions.trim() ||
    !Number.isInteger(input.maxTokens) || input.maxTokens < 256 || input.maxTokens > 32768) {
    throw failure("OCR requires resolved model, detail, instructions, and output limit.", "invalid-argument", 400);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 240000) throw failure("OCR timeout must be between 1 and 240000 milliseconds.", "invalid-argument", 400);
  signal?.throwIfAborted();
  const controller = new AbortController();
  let timer, abort;
  const cancelled = new Promise((resolve, reject) => {
    abort = () => {const error = signal.reason || new DOMException("Cancelled", "AbortError"); controller.abort(error); reject(error);};
    signal?.addEventListener("abort", abort, {once: true});
    timer = setTimeout(() => {
      const error = failure("OCR took too long. Check before starting another request.", "ocr-timeout", 504);
      controller.abort(error); reject(error);
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([cancelled, createClient().responses.create({
      model: input.model, instructions: input.instructions, max_output_tokens: input.maxTokens,
      stream: false, store: false,
      input: [{role: "user", content: [
        {type: "input_text", text: "Transcribe the text visible in this image. Return the requested JSON object."},
        {type: "input_image", image_url: `data:${image.mimeType};base64,${image.base64}`, detail: input.detail},
      ]}],
      text: {format: {type: "json_schema", name: "image_ocr_transcription", strict: true, schema: {
        type: "object", properties: {text: {type: "string"}, warnings: {type: "array", items: {type: "string"}}},
        required: ["text", "warnings"], additionalProperties: false,
      }}},
    }, {signal: controller.signal, timeout: timeoutMs, maxRetries: 0})]);
    controller.signal.throwIfAborted();
    if (response?.status === "incomplete" && response.incomplete_details?.reason === "max_output_tokens") {
      throw failure("OCR reached the configured output limit. Increase maximum output tokens or use a smaller section of the image.", "ocr-output-truncated");
    }
    const messages = Array.isArray(response?.output) ? response.output.filter(item => item?.type === "message") : [];
    const content = messages.flatMap(item => Array.isArray(item.content) ? item.content : []);
    if (content.some(item => item?.type === "refusal") || response?.incomplete_details?.reason === "content_filter") {
      throw failure("The OCR service could not transcribe this image. Try a different image.", "ocr-refused");
    }
    if (response?.status !== "completed" || response.error || messages.some(item => item.role !== "assistant" || item.status !== "completed")) {
      throw failure("The OCR service did not complete the transcription.");
    }
    const parts = content.filter(item => item?.type === "output_text");
    if (!parts.length || parts.some(item => typeof item.text !== "string")) throw failure("The OCR service returned no transcription.");
    return parseOcrResult(parts.map(item => item.text).join(""), "openai", input.model);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error.name === "APIConnectionTimeoutError") throw failure("OCR took too long. Check before starting another request.", "ocr-timeout", 504);
    throw error;
  } finally {clearTimeout(timer); signal?.removeEventListener("abort", abort);}
}
module.exports = {extractOpenAIImageText};
