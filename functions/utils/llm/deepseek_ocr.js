const {normalizeOcrImage, OCR_MODELS_BY_PROVIDER, OCR_DETAILS} = require("./image_ocr_settings");
const {ocrFailure: failure, parseOcrResult} = require("./image_ocr_result");

async function extractDeepseekImageText(input, {createClient, timeoutMs = 240000, signal} = {}) {
  const image = normalizeOcrImage(input.image);
  if (!OCR_MODELS_BY_PROVIDER.deepseek.includes(input.model) || !OCR_DETAILS.includes(input.detail) || typeof input.instructions !== "string" ||
    !input.instructions.trim() || !Number.isInteger(input.maxTokens) || input.maxTokens < 256 || input.maxTokens > 32768) {
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
    const completion = await Promise.race([cancelled, createClient().chat.completions.create({
      model: input.model, thinking: {type: "disabled"}, temperature: 0, max_tokens: input.maxTokens,
      response_format: {type: "json_object"}, stream: false,
      messages: [{role: "system", content: input.instructions}, {role: "user", content: [
        {type: "text", text: "Transcribe the text visible in this image. Return the requested JSON object."},
        {type: "image_url", image_url: {url: `data:${image.mimeType};base64,${image.base64}`, detail: input.detail}},
      ]}],
    }, {signal: controller.signal})]);
    controller.signal.throwIfAborted();
    const choice = completion?.choices?.[0];
    if (choice?.finish_reason === "length") throw failure("OCR reached the configured output limit. Increase maximum output tokens or use a smaller section of the image.", "ocr-output-truncated");
    return parseOcrResult(choice?.message?.content, "deepseek", input.model);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error.name === "APIConnectionTimeoutError") throw failure("OCR took too long. Check before starting another request.", "ocr-timeout", 504);
    throw error;
  } finally {clearTimeout(timer); signal?.removeEventListener("abort", abort);}
}
module.exports = {extractDeepseekImageText};
