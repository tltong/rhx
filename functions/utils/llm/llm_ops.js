const {generateLlmText, generateLlmImage, extractLlmImageText, searchLlmWeb, callLlm, LlmUtil} = require("./llm_util");
const {parseModelJson} = require("./json_output");

const DEEPSEEK_REQUEST_PROFILES = Object.freeze({
  STANDARD_PRO: Object.freeze({
    model: "deepseek-v4-pro",
    temperature: 0.7,
    thinking: Object.freeze({ type: "disabled" }),
  }),
  DIAGRAM_PRO: Object.freeze({
    model: "deepseek-v4-pro",
    temperature: 0.7,
    thinking: Object.freeze({ type: "disabled" }),
  }),
});

module.exports = {
  DEEPSEEK_REQUEST_PROFILES,
  generateLlmText,
  generateLlmImage,
  extractLlmImageText,
  searchLlmWeb,
  parseLlmJson: parseModelJson,
  callLlm,
  LlmUtil,
};
