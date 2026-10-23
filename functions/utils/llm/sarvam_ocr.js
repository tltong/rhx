const {SarvamAIClient} = require("sarvamai");
const {defineSecret} = require("firebase-functions/params");
const sharp = require("sharp");
const {Parser} = require("htmlparser2");
const {setTimeout: delay} = require("node:timers/promises");
const {normalizeOcrImage, getSarvamLanguageCode, OCR_MAX_IMAGE_BYTES} = require("./image_ocr_settings");
const {ocrFailure, parseOcrResult} = require("./image_ocr_result");

const SARVAM_OCR_MODEL = "sarvam-vision-v1";
const SARVAM_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const sarvamApiKey = defineSecret("SARVAM_API_KEY");
const terminalStates = new Set(["completed", "partially_completed", "failed", "rejected"]);
const jobStates = new Set(["pending", "running", ...terminalStates]);
const timeoutFailure = () => ocrFailure("OCR took too long. The Sarvam job may still be processing; check before starting another request.", "ocr-timeout", 504);

// Disable redirects and bound the SDK's response buffering, including error bodies.
async function sarvamFetch(url, options) {
  const response = await fetch(url, {...options, redirect: "error"});
  const reader = response.body?.getReader();
  if (!reader) return response;
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SARVAM_MAX_RESPONSE_BYTES) throw ocrFailure("Sarvam returned an oversized OCR response.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {reader.releaseLock();}
  return new Response(Buffer.concat(chunks), {status: response.status, statusText: response.statusText, headers: response.headers});
}

async function prepareSarvamImage(image, maxBytes) {
  try {
    const source = sharp(Buffer.from(image.base64, "base64"), {limitInputPixels: 16 * 1024 * 1024, animated: true, failOn: "warning"});
    const metadata = await source.metadata();
    if ((metadata.pages || 1) !== 1) throw ocrFailure("Upload a single-frame image for Sarvam OCR.", "invalid-argument", 400);
    // Decode the actual pixels, honor EXIF orientation, and flatten transparency.
    // PNG also keeps the existing WebP input contract without lossy conversion.
    const {data, info} = await source.rotate().flatten({background: "#ffffff"}).png().toBuffer({resolveWithObject: true});
    if (!info.width || !info.height || info.width > 8192 || info.height > 8192 || data.length > maxBytes) {
      throw ocrFailure("The converted image exceeds the configured OCR limits. Upload a smaller image.", "invalid-argument", 400);
    }
    return {data, filename: "image.png", contentType: "image/png"};
  } catch (error) {
    if (error.code === "invalid-argument") throw error;
    throw ocrFailure("The image could not be decoded within Sarvam's image limits. Upload a valid PNG, JPEG, or WebP image of at most 16 megapixels.", "invalid-argument", 400);
  }
}

function htmlToOcrText(html) {
  const parts = [], ignored = new Set(["script", "style", "noscript", "template"]);
  const blocks = new Set(["p", "div", "section", "article", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "ul", "ol", "li", "table", "tr"]);
  let hiddenDepth = 0, preDepth = 0;
  const line = (count = 1) => {
    let trailing = 0;
    for (let i = parts.length - 1; i >= 0 && trailing < count; i--) {
      const length = parts[i].match(/\n*$/)[0].length;
      trailing += length;
      if (length !== parts[i].length) break;
    }
    if (trailing < count) parts.push("\n".repeat(count - trailing));
  };
  const parser = new Parser({
    onopentag(name) {
      if (hiddenDepth || ignored.has(name)) {hiddenDepth++; return;}
      if (blocks.has(name) || name === "br" || name === "hr") line();
      if (name === "pre") preDepth++;
    },
    ontext(text) {if (!hiddenDepth) parts.push(preDepth ? text : text.replace(/[\t\r\n\f ]+/g, " "));},
    onclosetag(name) {
      if (hiddenDepth) {hiddenDepth--; return;}
      if (name === "pre") preDepth--;
      if (name === "td" || name === "th") parts.push("\t");
      if (blocks.has(name)) line(name === "p" ? 2 : 1);
    },
  }, {decodeEntities: true});
  parser.write(html); parser.end();
  return parts.join("").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseSarvamResult(result, jobId, status) {
  if (result?.type !== "digitise" || result.job_id !== jobId || !["completed", "partially_completed"].includes(result.status) ||
    !Array.isArray(result.documents) || result.documents.length !== 1 ||
    !Array.isArray(result.documents[0]?.pages) || result.documents[0].pages.length !== 1 ||
    !Array.isArray(result.documents[0].pages[0]?.blocks)) {
    throw ocrFailure("Sarvam returned an invalid image transcription.");
  }
  if (Buffer.byteLength(JSON.stringify(result)) > SARVAM_MAX_RESPONSE_BYTES) throw ocrFailure("Sarvam returned an oversized OCR response.");
  const document = result.documents[0], page = document.pages[0];
  const blocks = page.blocks.map((block, index) => {
    if (!block || typeof block.text !== "string" ||
      block.layout_tag !== undefined && typeof block.layout_tag !== "string" ||
      block.reading_order != null && (!Number.isFinite(block.reading_order) || block.reading_order < 0)) {
      throw ocrFailure("Sarvam returned an invalid transcription block.");
    }
    // JSON text blocks are already plain text. Only table blocks contain HTML;
    // parsing ordinary text as HTML would lose literal angle brackets or tags.
    const text = block.layout_tag?.toLowerCase() === "table" && /<table[\s>]/i.test(block.text)
      ? htmlToOcrText(block.text) : block.text;
    return {text, order: block.reading_order ?? index, index};
  }).sort((a, b) => a.order - b.order || a.index - b.index);
  const warnings = [];
  if (status === "partially_completed" || result.status === "partially_completed" || result.usage?.pages_failed > 0 ||
    document.partial || document.status === "partially_completed" || page.status && page.status !== "completed") {
    warnings.push("Sarvam reported incomplete processing. Review the transcription against the image.");
  }
  if (Array.isArray(document.warnings) && document.warnings.length) warnings.push("Sarvam reported extraction warnings. Review the transcription against the image.");
  return parseOcrResult(JSON.stringify({text: blocks.map(block => block.text).join("\n\n"), warnings}), "sarvam", SARVAM_OCR_MODEL);
}

class SarvamOcrUtil {
  constructor({createClient = () => {
    const apiKey = sarvamApiKey.value();
    if (typeof apiKey !== "string" || !apiKey.trim()) throw ocrFailure("Sarvam OCR is not configured.", "ocr-unavailable", 503);
    return new SarvamAIClient({apiSubscriptionKey: apiKey, maxRetries: 0, fetch: sarvamFetch, logging: {silent: true}});
  }, prepareImage = prepareSarvamImage, pollIntervalMs = 2000} = {}) {
    if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 5000) throw new Error("Invalid Sarvam polling interval.");
    Object.assign(this, {createClient, prepareImage, pollIntervalMs});
  }

  async extractTextFromImage(input, {timeoutMs = 240000, signal} = {}) {
    const maxBytes = input.maxImageBytes ?? OCR_MAX_IMAGE_BYTES;
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > OCR_MAX_IMAGE_BYTES) throw ocrFailure("Invalid OCR image size limit.", "invalid-argument", 400);
    const image = normalizeOcrImage(input.image, maxBytes);
    const language = getSarvamLanguageCode(input.language);
    if (!language) throw ocrFailure("Sarvam supports English and 22 Indian languages. Choose another OCR provider for this language.", "invalid-argument", 400);
    if ((input.model ?? SARVAM_OCR_MODEL) !== SARVAM_OCR_MODEL) throw ocrFailure("Choose a supported Sarvam OCR model.", "invalid-argument", 400);
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 240000) throw ocrFailure("OCR timeout must be between 1 and 240000 milliseconds.", "invalid-argument", 400);
    signal?.throwIfAborted();
    const controller = new AbortController(), deadline = Date.now() + timeoutMs;
    let jobId;
    const cancelled = new Promise((resolve, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {once: true});
    });
    const abort = () => controller.abort(signal.reason || new DOMException("Cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, {once: true});
    const timer = setTimeout(() => controller.abort(timeoutFailure()), timeoutMs);
    const check = () => {
      if (Date.now() >= deadline && !controller.signal.aborted) controller.abort(timeoutFailure());
      controller.signal.throwIfAborted();
    };
    const options = () => {
      check();
      return {abortSignal: controller.signal, maxRetries: 0, timeoutInSeconds: Math.max(0.001, (deadline - Date.now()) / 1000)};
    };
    const execute = async () => {
      const file = await this.prepareImage(image, maxBytes);
      check();
      const client = await this.createClient();
      check();
      const job = await client.docAi.digitise({file: [file], language, content_type: "mixed", model: SARVAM_OCR_MODEL}, options());
      check();
      if (typeof job?.job_id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(job.job_id) || !jobStates.has(job.status)) throw ocrFailure("Sarvam returned an invalid OCR job.");
      jobId = job.job_id;
      let status = job.status;
      while (!terminalStates.has(status)) {
        await delay(this.pollIntervalMs, undefined, {signal: controller.signal});
        const progress = await client.docAi.getStatus(jobId, options());
        check();
        if (progress?.job_id !== jobId || progress.pipeline !== "digitise" || !jobStates.has(progress.status)) throw ocrFailure("Sarvam returned an invalid OCR job status.");
        status = progress.status;
      }
      if (status === "failed" || status === "rejected") throw ocrFailure("Sarvam could not process the image.", "ocr-unavailable", 503);
      const result = await client.docAi.getResults(jobId, {format: "json"}, options());
      check();
      const transcription = parseSarvamResult(result, jobId, status);
      check();
      return transcription;
    };
    try {return await Promise.race([cancelled, execute()]);}
    catch (error) {
      let safe;
      if (controller.signal.aborted) safe = controller.signal.reason;
      else if (error?.code === "invalid-argument" || typeof error?.code === "string" && error.code.startsWith("ocr-")) safe = error;
      else if (error?.name === "SarvamAITimeoutError") safe = timeoutFailure();
      else if (error?.statusCode === 429) safe = ocrFailure("Sarvam is busy or its quota has been reached. Try again later.", "ocr-unavailable", 429);
      else safe = ocrFailure("Sarvam OCR is unavailable. Check its API key, account access, and credits.", "ocr-unavailable", 503);
      if (jobId) safe.providerJobId = jobId;
      throw safe;
    } finally {clearTimeout(timer); signal?.removeEventListener("abort", abort);}
  }
}

const sarvamOcrUtil = new SarvamOcrUtil();
module.exports = {SarvamOcrUtil, sarvamOcrUtil, sarvamApiKey, SARVAM_OCR_MODEL, prepareSarvamImage, sarvamFetch};
