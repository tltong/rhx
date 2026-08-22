const {
  generateDeepseekJson,
} = require("../../deepseek");

const DEEPSEEK_REQUEST_PROFILES = Object.freeze({
  STANDARD_PRO: Object.freeze({
    model: "deepseek-v4-pro",
    thinking: Object.freeze({ type: "disabled" }),
  }),
  DIAGRAM_PRO: Object.freeze({
    model: "deepseek-v4-pro",
    thinking: Object.freeze({ type: "disabled" }),
  }),
});

async function generateLlmText(input, options = {}) {
  const result = await generateDeepseekJson(input, options);

  return result.json;
}

module.exports = {
  DEEPSEEK_REQUEST_PROFILES,
  generateLlmText,
};
