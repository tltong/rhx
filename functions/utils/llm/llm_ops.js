const {generateLlmText, generateLlmImage, callLlm, LlmUtil} = require("./llm_util");

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
  callLlm,
  LlmUtil,
};
