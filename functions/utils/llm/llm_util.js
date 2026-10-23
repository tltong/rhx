const {deepseekUtil} = require("./deepseek_util");
const {openaiUtil} = require("./openai_util");
const {paddleOcrUtil} = require("./paddleocr");

const LLM_PROVIDERS = Object.freeze({DEEPSEEK: "deepseek", OPENAI: "openai", PADDLEOCR: "paddleocr"});
const DEFAULT_LLM_PROVIDER = LLM_PROVIDERS.DEEPSEEK;
const providers = new Map();
let defaultProvider = DEFAULT_LLM_PROVIDER;
function providerName(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("provider must be a non-empty string.");
  return value.trim().toLowerCase();
}
function registerLlmProvider(name, adapter) {
  name = providerName(name);
  if (!adapter || !(typeof adapter.extractTextFromImage === "function" || typeof adapter.generateImage === "function" ||
    (typeof adapter.call === "function" && typeof adapter.generateText === "function"))) {
    throw new Error("adapter must provide call and generateText, generateImage, or extractTextFromImage.");
  }
  providers.set(name, adapter);
  return adapter;
}
registerLlmProvider("deepseek", deepseekUtil);
registerLlmProvider("openai", openaiUtil);
registerLlmProvider("paddleocr", paddleOcrUtil);
function requireProvider(name) {
  const adapter = providers.get(providerName(name));
  if (!adapter) throw new Error(`Unsupported LLM provider: ${name}.`);
  return adapter;
}
class LlmUtil {
  constructor({provider = defaultProvider} = {}) {this.provider = providerName(provider);}
  setProvider(provider) {requireProvider(provider); this.provider = providerName(provider); return this.provider;}
  getProvider() {return this.provider;}
  getProviderAdapter(provider = this.provider) {return requireProvider(provider);}
  invoke(method, input, {provider, ...options} = {}) {
    const name = provider || (method === "generateImage" ? "openai" : method === "extractTextFromImage" ? "deepseek" : this.provider);
    const adapter = this.getProviderAdapter(name);
    if (typeof adapter[method] !== "function") throw new Error(`LLM provider ${name} does not support ${method}.`);
    return adapter[method](input, options);
  }
  call(input, options) {return this.invoke("call", input, options);}
  generateText(input, options) {return this.invoke("generateText", input, options);}
  generateImage(input, options) {return this.invoke("generateImage", input, options);}
  extractTextFromImage(input, options) {return this.invoke("extractTextFromImage", input, options);}
}
const llmUtil = new LlmUtil();
module.exports = {LlmUtil, llmUtil, LLM_PROVIDERS, DEFAULT_LLM_PROVIDER, registerLlmProvider,
  getAvailableLlmProviders: () => [...providers.keys()], getDefaultLlmProvider: () => defaultProvider,
  setDefaultLlmProvider: name => {requireProvider(name); defaultProvider = providerName(name); return defaultProvider;},
  callLlm: (input, options) => llmUtil.call(input, options),
  generateLlmText: (input, options) => llmUtil.generateText(input, options),
  generateLlmImage: (input, options) => llmUtil.generateImage(input, options),
  extractLlmImageText: (input, options) => llmUtil.extractTextFromImage(input, options)};
