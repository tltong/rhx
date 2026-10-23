// Keep this contract in sync between the Functions and Web layers.
const OCR_MODELS_BY_PROVIDER = Object.freeze({
  deepseek: Object.freeze(["deepseek-flash"]),
  openai: Object.freeze(["gpt-6.1-sol", "gpt-6-astra"]),
  paddleocr: Object.freeze(["PP-OCRv6_medium"]),
  sarvam: Object.freeze(["sarvam-vision-v1"]),
});
const SARVAM_OCR_LANGUAGES = Object.freeze({
  assamese: "as-IN", bengali: "bn-IN", bodo: "brx-IN", dogri: "doi-IN", english: "en-IN",
  gujarati: "gu-IN", hindi: "hi-IN", kannada: "kn-IN", kashmiri: "ks-IN", konkani: "kok-IN",
  maithili: "mai-IN", malayalam: "ml-IN", manipuri: "mni-IN", marathi: "mr-IN", nepali: "ne-IN",
  odia: "od-IN", punjabi: "pa-IN", sanskrit: "sa-IN", santali: "sat-IN", sindhi: "sd-IN",
  tamil: "ta-IN", telugu: "te-IN", urdu: "ur-IN",
});
const sarvamLanguages = new Map(Object.entries(SARVAM_OCR_LANGUAGES).flatMap(([name, code]) =>
  [[name, code], [code.toLowerCase(), code], [code.split("-")[0], code]]));
sarvamLanguages.set("தமிழ்", "ta-IN");
sarvamLanguages.set("oriya", "od-IN");
const OCR_PROVIDERS = Object.freeze(Object.keys(OCR_MODELS_BY_PROVIDER));
const OCR_DEFAULT_MODELS = Object.freeze(Object.fromEntries(OCR_PROVIDERS.map(provider => [provider, OCR_MODELS_BY_PROVIDER[provider][0]])));
const OCR_MODELS = Object.freeze(Object.values(OCR_MODELS_BY_PROVIDER).flat());
const OCR_DETAILS = Object.freeze(["original", "high", "auto", "low"]);
const OCR_MIME_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);
const OCR_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_OCR_SETTINGS = Object.freeze({
  provider: "openai", model: "gpt-6.1-sol", languageProviders: Object.freeze({}), detail: "original", languageHint: "auto",
  ocrInstructions: "Transcribe all legible text in reading order. Detect the language or languages automatically. Preserve the original script, wording, spelling, punctuation, and paragraphs. Keep mixed-language text as written. Mark unreadable passages as [illegible] instead of guessing.",
  additionalInstructions: "", maxTokens: 8192, maxImageSizeMiB: 8, timeoutSeconds: 240,
});
function invalid(message) {return Object.assign(new Error(message), {code: "invalid-argument"});}
function record(value, name = "Input") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(`${name} must be an object.`);
  return value;
}
function text(value, name, max, allowEmpty = false) {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim())) throw invalid(`${name} must be ${allowEmpty ? "text" : "non-empty text"} of at most ${max} characters.`);
  return value.trim();
}
function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw invalid(`${name} must be an integer from ${min} to ${max}.`);
  return value;
}
function normalizeOcrTarget(provider, model) {
  if (!OCR_PROVIDERS.includes(provider)) throw invalid("OCR provider must be openai, deepseek, paddleocr, or sarvam.");
  if (!OCR_MODELS_BY_PROVIDER[provider].includes(model)) throw invalid(`Choose an OCR model for ${provider}: ${OCR_MODELS_BY_PROVIDER[provider].join(", ")}.`);
  return {provider, model};
}
function normalizeOcrLanguage(value) {
  return text(value, "Language", 200).normalize("NFKC").replace(/\s+/g, " ");
}
function ocrLanguageKey(value) {return normalizeOcrLanguage(value).toLowerCase();}
function getSarvamLanguageCode(value) {return sarvamLanguages.get(ocrLanguageKey(value)) || null;}
function normalizeLanguageProviders(input = {}) {
  record(input, "Language providers");
  const entries = new Map();
  for (const [language, provider] of Object.entries(input)) {
    const key = ocrLanguageKey(language);
    if (["__proto__", "constructor", "prototype"].includes(key)) throw invalid("Invalid language key.");
    if (provider === "" || provider === null) continue;
    if (!OCR_PROVIDERS.includes(provider)) throw invalid("Choose OpenAI, DeepSeek, PaddleOCR, or Sarvam for each language.");
    if (provider === "sarvam" && !getSarvamLanguageCode(language)) throw invalid(`Sarvam does not support ${normalizeOcrLanguage(language)}. Choose another OCR provider for this language.`);
    if (entries.has(key) && entries.get(key) !== provider) throw invalid("A language cannot have conflicting OCR providers.");
    entries.set(key, provider);
  }
  return Object.fromEntries(entries);
}
function resolveOcrTarget(input, settings) {
  const key = ocrLanguageKey(input.language);
  const overrides = settings.languageProviders || {};
  const provider = Object.hasOwn(overrides, key) ? overrides[key] : "openai";
  return normalizeOcrTarget(provider, provider === "openai" ? settings.model : OCR_DEFAULT_MODELS[provider]);
}
function normalizeOcrSettings(input) {
  record(input, "OCR configuration");
  // Read legacy global settings without writing a migration. Language routing
  // always falls back to OpenAI; only explicit language overrides change it.
  const legacyProvider = input.provider === undefined
    ? (input.model === "deepseek-flash" ? "deepseek" : "openai") : input.provider;
  const legacy = normalizeOcrTarget(legacyProvider, input.model ?? OCR_DEFAULT_MODELS[legacyProvider]);
  const target = {provider: "openai", model: legacy.provider === "openai" ? legacy.model : OCR_DEFAULT_MODELS.openai};
  if (!OCR_DETAILS.includes(input.detail)) throw invalid("Image detail must be original, high, auto, or low.");
  return {...target, languageProviders: normalizeLanguageProviders(input.languageProviders), detail: input.detail,
    languageHint: text(input.languageHint, "Language hint", 200),
    ocrInstructions: text(input.ocrInstructions, "Base OCR instructions", 16000),
    additionalInstructions: text(input.additionalInstructions, "Additional instructions", 8000, true),
    maxTokens: integer(input.maxTokens, "Maximum output tokens", 256, 32768),
    maxImageSizeMiB: integer(input.maxImageSizeMiB, "Maximum image size", 1, 8),
    timeoutSeconds: integer(input.timeoutSeconds, "Request timeout", 10, 240)};
}
function imageDimensions(bytes, mimeType) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset, value) => [...value].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  if (mimeType === "image/png" && bytes.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value) && ascii(12, "IHDR")) {
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (mimeType === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218 || offset + 2 > bytes.length) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) {
        return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
      }
      offset += length;
    }
  }
  if (mimeType === "image/webp" && bytes.length >= 25 && ascii(0, "RIFF") && ascii(8, "WEBP")) {
    const little24 = offset => bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
    if (bytes.length >= 30 && ascii(12, "VP8X")) return [little24(24) + 1, little24(27) + 1];
    if (bytes.length >= 30 && ascii(12, "VP8 ") && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) return [view.getUint16(26, true) & 16383, view.getUint16(28, true) & 16383];
    if (ascii(12, "VP8L") && bytes[20] === 47) {
      const bits = view.getUint32(21, true);
      return [(bits & 16383) + 1, (bits >>> 14 & 16383) + 1];
    }
  }
  throw invalid("Image contents must match a supported PNG, JPEG, or WebP file.");
}
function normalizeOcrImage(input, maxBytes = OCR_MAX_IMAGE_BYTES) {
  record(input, "Image");
  const {mimeType, base64} = input;
  if (!OCR_MIME_TYPES.includes(mimeType)) throw invalid("Upload a PNG, JPEG, or WebP image.");
  if (typeof base64 !== "string" || !base64.length || base64.length > Math.ceil(maxBytes / 3) * 4 ||
    base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw invalid("Image must contain valid base64 data within the configured size limit, without a data URL prefix.");
  const binary = atob(base64);
  if (binary.length > maxBytes || btoa(binary) !== base64) throw invalid("Image exceeds the configured size limit or has invalid base64 data.");
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const [width, height] = imageDimensions(bytes, mimeType);
  if (!width || !height || width > 8192 || height > 8192) throw invalid("Image width and height must be from 1 to 8192 pixels.");
  return {mimeType, base64};
}
function normalizeOcrInput(input) {
  record(input);
  const allowed = ["image", "language", "detail", "languageHint", "additionalInstructions"];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw invalid("Unsupported OCR input parameter.");
  const result = {image: normalizeOcrImage(input.image), language: normalizeOcrLanguage(input.language)};
  if (input.detail !== undefined) {
    if (!OCR_DETAILS.includes(input.detail)) throw invalid("Image detail must be original, high, auto, or low.");
    result.detail = input.detail;
  }
  if (input.languageHint !== undefined) result.languageHint = text(input.languageHint, "Language hint", 200);
  if (input.additionalInstructions !== undefined) result.additionalInstructions = text(input.additionalInstructions, "Additional instructions", 8000, true);
  return result;
}
export {OCR_PROVIDERS, OCR_MODELS_BY_PROVIDER, OCR_DEFAULT_MODELS, OCR_MODELS, OCR_DETAILS, OCR_MIME_TYPES, OCR_MAX_IMAGE_BYTES, DEFAULT_OCR_SETTINGS,
  normalizeOcrTarget, resolveOcrTarget, normalizeOcrSettings, normalizeOcrImage, normalizeOcrInput,
  normalizeOcrLanguage, ocrLanguageKey, normalizeLanguageProviders, SARVAM_OCR_LANGUAGES, getSarvamLanguageCode};
