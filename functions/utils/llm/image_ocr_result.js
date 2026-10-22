function ocrFailure(message, code = "ocr-invalid-response", status = 502) {return Object.assign(new Error(message), {code, status});}
function parseOcrResult(content, provider, model) {
  let payload;
  try {payload = JSON.parse(content);} catch {throw ocrFailure("The OCR service returned an unreadable result. Please try again.");}
  if (!payload || typeof payload.text !== "string" || !Array.isArray(payload.warnings) ||
    payload.warnings.length > 50 || payload.warnings.some(warning => typeof warning !== "string" || warning.length > 1000)) {
    throw ocrFailure("The OCR service returned an invalid transcription result.");
  }
  const warnings = payload.warnings.filter(warning => warning.trim());
  if (!payload.text.trim() && !warnings.length) warnings.push("No legible text was found in this image.");
  return {text: payload.text, warnings, provider, model};
}
module.exports = {ocrFailure, parseOcrResult};
