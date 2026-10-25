const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {createOcrJobs} = require("./features/image_ocr/application/image_ocr_jobs");
const {getOcrJobsBucket} = require("./features/image_ocr/infrastructure/storage_ocr_job_repository");
const {deepseekApiKey} = require("./utils/llm/deepseek_util");
const {openaiApiKey} = require("./utils/llm/openai_util");
const {sarvamApiKey} = require("./utils/llm/sarvam_ocr");

const jobs = createOcrJobs();
const processImageOcrJob = onObjectFinalized({bucket: getOcrJobsBucket(), region: "us-central1",
  memory: "1GiB", timeoutSeconds: 540, concurrency: 1, minInstances: 0, maxInstances: 2, retry: true,
  secrets: [deepseekApiKey, openaiApiKey, sarvamApiKey]}, event => jobs.processObject(event.data));

module.exports = {processImageOcrJob};
