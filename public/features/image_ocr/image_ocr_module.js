import {imageOcrClient} from "../../utils/llm/image_ocr_client.js?v=20261025-ocr-jobs-v1";
import {normalizeOcrImage, normalizeOcrInput, normalizeOcrSettings, normalizeOcrLanguage, OCR_MAX_IMAGE_BYTES} from "../../utils/llm/image_ocr_settings.js?v=20261023-ocr-sarvam-v1";
import {getCurrentFirebaseAuthRawUser} from "../../utils/firebase/firebase_auth.js";
export {DEFAULT_OCR_SETTINGS, OCR_PROVIDERS, OCR_MODELS_BY_PROVIDER, OCR_DEFAULT_MODELS, OCR_MODELS, OCR_DETAILS} from "../../utils/llm/image_ocr_settings.js?v=20261023-ocr-sarvam-v1";

export async function toOcrImage(image, maxBytes = OCR_MAX_IMAGE_BYTES) {
  if (typeof Blob !== "undefined" && image instanceof Blob) {
    if (!image.size || image.size > maxBytes) throw Object.assign(new Error("Image exceeds the configured size limit or is empty."), {code: "invalid-argument"});
    const bytes = new Uint8Array(await image.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return normalizeOcrImage({mimeType: image.type, base64: btoa(binary)}, maxBytes);
  }
  return normalizeOcrImage(image, maxBytes);
}
export function createImageOcrFeature({client = imageOcrClient, getUser = getCurrentFirebaseAuthRawUser} = {}) {
  function accountGuard() {
    const uid = getUser()?.uid;
    if (!uid) throw Object.assign(new Error("Sign in before extracting image text."), {code: "unauthenticated"});
    return () => {if (getUser()?.uid !== uid) throw Object.assign(new Error("The signed-in account changed. Reload this page."), {code: "unauthenticated"});};
  }
  return {
    getPendingImageOcrJob: () => client.getPendingJob(),
    resumeImageOcrJob: (jobId, options) => client.resumeJob(jobId, options),
    getImageOcrConfig: () => client.request("getConfig"),
    saveImageOcrConfig: configuration => client.request("saveConfig", normalizeOcrSettings(configuration)),
    async extractTextFromImage(input, options = {}) {
      const assertUser = accountGuard();
      const snapshot = {...input};
      const image = await toOcrImage(snapshot.image);
      assertUser();
      const normalized = normalizeOcrInput({...snapshot, image});
      const result = await client.requestJob("extract", normalized, options);
      assertUser(); return result;
    },
    async testImageOcr(input, options = {}) {
      const assertUser = accountGuard();
      const configuration = normalizeOcrSettings(input?.configuration);
      const language = normalizeOcrLanguage(input?.language);
      const image = await toOcrImage(input?.image, configuration.maxImageSizeMiB * 1024 * 1024);
      assertUser();
      const result = await client.requestJob("test", {image, language, configuration}, options);
      assertUser(); return result;
    },
  };
}
const feature = createImageOcrFeature();
export const {getImageOcrConfig, saveImageOcrConfig, extractTextFromImage, testImageOcr, getPendingImageOcrJob, resumeImageOcrJob} = feature;
