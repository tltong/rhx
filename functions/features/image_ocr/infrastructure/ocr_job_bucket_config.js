function requireOcrJobsBucketName(value) {
  if (typeof value !== "string" || value.length > 63 ||
    !/^[a-z0-9][a-z0-9-]*-ocr-jobs$/.test(value)) {
    throw new Error("IMAGE_OCR_JOBS_BUCKET must be an explicit lowercase bucket name ending in -ocr-jobs.");
  }
  return value;
}

module.exports = {requireOcrJobsBucketName};
