const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {openaiApiKey} = require("../utils/llm/openai_util");
const {deepseekApiKey} = require("../utils/llm/deepseek_util");
const generator = require("../features/news_article_generator/news_article_generator_module").createNewsGenerator();
async function processNewsGeneration(event, {run = generator.run} = {}) {
  const before = event.data?.before?.data(), after = event.data?.after?.data();
  if (after?.status !== "queued" || !after.requestSequence || before?.requestSequence === after.requestSequence) return null;
  return run(event.params.generationId, after.requestSequence);
}
const onNewsGenerationRequested = onDocumentWritten({document: "newsGenerations/{generationId}", region: "us-central1", memory: "1GiB", timeoutSeconds: 540,
  concurrency: 1, maxInstances: 10, secrets: [openaiApiKey, deepseekApiKey], retry: true}, processNewsGeneration);
module.exports = {processNewsGeneration, onNewsGenerationRequested};
