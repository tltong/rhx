import deepseekUtil, {
  callDeepseek,
  generateDeepseekText
} from "./deepseek_util.js?v=20260724-thinking-disabled";

export const LLM_PROVIDERS = Object.freeze({
  DEEPSEEK: "deepseek"
});

export const DEFAULT_LLM_PROVIDER = LLM_PROVIDERS.DEEPSEEK;

const providerRegistry = new Map([
  [
    LLM_PROVIDERS.DEEPSEEK,
    {
      name: LLM_PROVIDERS.DEEPSEEK,
      client: deepseekUtil,
      call: callDeepseek,
      generateText: generateDeepseekText
    }
  ]
]);

let defaultProvider = DEFAULT_LLM_PROVIDER;

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeProviderName(provider = defaultProvider) {
  return requireNonEmptyString(provider, "provider").toLowerCase();
}

function requireProvider(provider = defaultProvider) {
  const providerName = normalizeProviderName(provider);
  const providerAdapter = providerRegistry.get(providerName);

  if (!providerAdapter) {
    throw new Error(`Unsupported LLM provider: ${providerName}.`);
  }

  return providerAdapter;
}

function stripProviderOptions(options = {}) {
  const { provider, ...providerOptions } = options;

  return providerOptions;
}

export function getAvailableLlmProviders() {
  return [...providerRegistry.keys()];
}

export function getDefaultLlmProvider() {
  return defaultProvider;
}

export function setDefaultLlmProvider(provider) {
  defaultProvider = requireProvider(provider).name;

  return defaultProvider;
}

export function registerLlmProvider(provider, adapter) {
  const providerName = normalizeProviderName(provider);

  if (!adapter || typeof adapter !== "object") {
    throw new Error("adapter must be a non-null object.");
  }

  if (typeof adapter.call !== "function") {
    throw new Error("adapter.call must be a function.");
  }

  if (typeof adapter.generateText !== "function") {
    throw new Error("adapter.generateText must be a function.");
  }

  providerRegistry.set(providerName, {
    ...adapter,
    name: providerName
  });

  return providerRegistry.get(providerName);
}

export class LlmUtil {
  constructor(options = {}) {
    this.provider = normalizeProviderName(options.provider || defaultProvider);
  }

  setProvider(provider) {
    this.provider = requireProvider(provider).name;

    return this.provider;
  }

  getProvider() {
    return this.provider;
  }

  getProviderAdapter(provider = this.provider) {
    return requireProvider(provider);
  }

  call(input, options = {}) {
    const providerAdapter = this.getProviderAdapter(options.provider || this.provider);

    return providerAdapter.call(input, stripProviderOptions(options));
  }

  generateText(input, options = {}) {
    const providerAdapter = this.getProviderAdapter(options.provider || this.provider);

    return providerAdapter.generateText(input, stripProviderOptions(options));
  }
}

const defaultLlmUtil = new LlmUtil();

export function callLlm(input, options = {}) {
  return defaultLlmUtil.call(input, options);
}

export function generateLlmText(input, options = {}) {
  return defaultLlmUtil.generateText(input, options);
}

export default defaultLlmUtil;
