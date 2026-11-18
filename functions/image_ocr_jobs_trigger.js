const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {defineString} = require("firebase-functions/params");
const {createOcrJobs} = require("./features/image_ocr/application/image_ocr_jobs");
const {deepseekApiKey} = require("./utils/llm/deepseek_util");
const {openaiApiKey} = require("./utils/llm/openai_util");
const {sarvamApiKey} = require("./utils/llm/sarvam_ocr");

const jobs = createOcrJobs();
// Firebase resolves the same environment setting for the trigger at deployment.
// Keeping it as a parameter also allows export discovery before values resolve.
const ocrJobsBucket = defineString("IMAGE_OCR_JOBS_BUCKET", {description: "Private temporary OCR jobs bucket for this project."});
const processImageOcrJob = onObjectFinalized({bucket: ocrJobsBucket, region: "us-central1",
  memory: "1GiB", timeoutSeconds: 540, concurrency: 1, minInstances: 0, maxInstances: 2, retry: true,
  secrets: [deepseekApiKey, openaiApiKey, sarvamApiKey]}, event => jobs.processObject(event.data));

module.exports = {processImageOcrJob};
