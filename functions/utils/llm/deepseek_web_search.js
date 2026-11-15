function timeoutError() {
  return Object.assign(new Error("The DeepSeek web search took too long. Please try again."), {name: "DeepseekTimeoutError", code: "deepseek-timeout", status: 504});
}
async function searchDeepseekWeb(input, {createClient, model, maxTokens = 12000, timeoutMs = 180000, jsonMode = false} = {}) {
  const prompt = typeof input === "string" ? input : input?.prompt;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 500000) throw Object.assign(new Error("Provide a web-search prompt."), {code: "invalid-argument"});
  const timeout = Math.max(1, Math.min(240000, Number(timeoutMs) || 180000));
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {const error = timeoutError(); controller.abort(error); reject(error);}, timeout);
  });
  try {
    const response = await Promise.race([createClient().responses.create({model, input: prompt,
      tools: [{type: "web_search"}], tool_choice: "required", reasoning: {effort: "none"},
      ...(jsonMode ? {text: {format: {type: "json_object"}}} : {}),
      max_output_tokens: Math.max(128, Math.min(32768, Number(maxTokens) || 12000))}, {signal: controller.signal, timeout}), deadline]);
    controller.signal.throwIfAborted();
    return response;
  } catch (error) {
    if (error.name === "APIConnectionTimeoutError") throw timeoutError();
    throw error;
  } finally {clearTimeout(timer);}
}
module.exports = {searchDeepseekWeb};
