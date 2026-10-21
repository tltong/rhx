// Keep this validation contract in sync with the Web layer's copy.
const IMAGE_MODELS = Object.freeze(["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]);
const IMAGE_SIZES = Object.freeze(["816x816", "960x720", "720x960", "1024x1024", "1536x1024", "1024x1536", "2048x2048"]);
const IMAGE_QUALITIES = Object.freeze(["low", "medium", "high"]);
const DEFAULT_IMAGE_SETTINGS = Object.freeze({model: IMAGE_MODELS[0], size: "1024x1024", quality: "medium", transparentBackground: false});
const SETTINGS_FIELDS = Object.freeze(Object.keys(DEFAULT_IMAGE_SETTINGS));
function invalid(message) {return Object.assign(new Error(message), {code: "invalid-argument"});}
function requireRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("Image settings must be an object.");
  return value;
}
function normalizeImageSize(size) {
  if (typeof size !== "string" || !/^\d+x\d+$/.test(size)) throw invalid("Size must use WIDTHxHEIGHT, for example 1024x1024.");
  const [width, height] = size.split("x").map(Number);
  const pixels = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
    width % 16 || height % 16 || width > 3840 || height > 3840 ||
    width / height < 1 / 3 || width / height > 3 || pixels < 655360 || pixels > 8294400) {
    throw invalid("Width and height must be multiples of 16 up to 3840, with 655,360–8,294,400 total pixels and an aspect ratio between 1:3 and 3:1.");
  }
  return `${width}x${height}`;
}
function normalizeImageSettings(input) {
  requireRecord(input);
  if (!IMAGE_MODELS.includes(input.model)) throw invalid("Choose a supported image model.");
  if (!IMAGE_QUALITIES.includes(input.quality)) throw invalid("Quality must be low, medium, or high.");
  if (typeof input.transparentBackground !== "boolean") throw invalid("transparentBackground must be true or false.");
  return {model: input.model, size: normalizeImageSize(input.size), quality: input.quality, transparentBackground: input.transparentBackground};
}
function resolveImageRequest(input, configuration = DEFAULT_IMAGE_SETTINGS) {
  requireRecord(input);
  if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 32000) throw invalid("Provide an image prompt of 1–32,000 characters.");
  const settings = Object.fromEntries(SETTINGS_FIELDS.map(key => [key, input[key] === undefined ? configuration[key] : input[key]]));
  return {prompt: input.prompt.trim(), ...normalizeImageSettings(settings)};
}
export {IMAGE_MODELS, IMAGE_SIZES, IMAGE_QUALITIES, DEFAULT_IMAGE_SETTINGS,
  normalizeImageSize, normalizeImageSettings, resolveImageRequest};
