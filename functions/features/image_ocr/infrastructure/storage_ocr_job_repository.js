const {getStorage} = require("firebase-admin/storage");
const {getFirebaseApp} = require("../../../utils/firebase/firebase_ops");
const {ocrFailure} = require("../../../utils/llm/image_ocr_result");

const getOcrJobsBucket = () => process.env.IMAGE_OCR_JOBS_BUCKET ||
  `${process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "readyherox"}-ocr-jobs`;
const MAX_OBJECT_BYTES = 12 * 1024 * 1024;

class StorageOcrJobRepository {
  constructor({getBucket = () => getStorage(getFirebaseApp()).bucket(getOcrJobsBucket()), now = () => Date.now()} = {}) {
    Object.assign(this, {getBucket, now});
    this.verifiedAt = 0;
  }
  async bucket() {
    const bucket = this.getBucket();
    // This is a separate GCS bucket, never the Firebase browser-upload bucket.
    if (!bucket.name?.endsWith("-ocr-jobs")) throw ocrFailure("Use a dedicated private OCR jobs bucket.", "ocr-unavailable", 503);
    if (this.now() - this.verifiedAt > 300000 || !this.verifiedAt) {
      const [metadata] = await bucket.getMetadata();
      if (!metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled ||
        metadata.iamConfiguration?.publicAccessPrevention !== "enforced" ||
        metadata.versioning?.enabled || metadata.softDeletePolicy?.retentionDurationSeconds > 0 || metadata.retentionPolicy?.retentionPeriod > 0 ||
        !metadata.lifecycle?.rule?.some(rule => rule.action?.type === "Delete" && rule.condition?.age === 1 &&
          Object.keys(rule.condition).length === 1)) {
        throw ocrFailure("Configure private OCR job storage and its one-day deletion policy.", "ocr-unavailable", 503);
      }
      this.verifiedAt = this.now();
    }
    return bucket;
  }
  async read(key, generation) {
    const bucket = await this.bucket();
    try {
      const file = bucket.file(key, generation ? {generation: String(generation)} : undefined);
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) > MAX_OBJECT_BYTES) throw new Error("OCR job object exceeds its limit.");
      const [bytes] = await bucket.file(key, {generation: String(metadata.generation)}).download({validation: "crc32c"});
      return {value: JSON.parse(bytes.toString("utf8")), generation: String(metadata.generation)};
    } catch (error) {if (Number(error.code) === 404) return null; throw error;}
  }
  async write(key, value, generation = 0) {
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length > MAX_OBJECT_BYTES) throw new Error("OCR job object exceeds its limit.");
    const bucket = await this.bucket();
    try {
      await bucket.file(key).save(bytes, {resumable: false, validation: "crc32c",
        preconditionOpts: {ifGenerationMatch: generation},
        metadata: {contentType: "application/json", cacheControl: "no-store"}});
      return true;
    } catch (error) {if (Number(error.code) === 412) return false; throw error;}
  }
  async remove(key, generation) {
    const bucket = await this.bucket();
    await bucket.file(key, generation ? {generation: String(generation),
      preconditionOpts: {ifGenerationMatch: generation}} : undefined).delete({ignoreNotFound: true});
  }
}
module.exports = {StorageOcrJobRepository, getOcrJobsBucket};
