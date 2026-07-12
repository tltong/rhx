import { firebaseConfig } from "../../config/firebase/firebase_config.js";

export const DEEPSEEK_FUNCTION_NAME = "generateDeepseekText";
export const DEFAULT_DEEPSEEK_REGION = "us-central1";
export const DEFAULT_FUNCTIONS_EMULATOR_PORT = 5001;
export const DEEPSEEK_HOSTING_REWRITE_PATH = "/api/generateDeepseekText";

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function getLocation() {
  return globalThis.location || null;
}

function isLocalHostname(hostname) {
  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]";
}

function formatUrlHost(hostname) {
  if (hostname === "::1") {
    return "[::1]";
  }

  return hostname;
}

export function getDeepseekFunctionUrl(options = {}) {
  const projectId = requireNonEmptyString(
    options.projectId || firebaseConfig.projectId,
    "projectId"
  );
  const region = requireNonEmptyString(
    options.region || DEFAULT_DEEPSEEK_REGION,
    "region"
  );
  const functionName = requireNonEmptyString(
    options.functionName || DEEPSEEK_FUNCTION_NAME,
    "functionName"
  );
  const location = getLocation();
  const hostname = options.hostname || location?.hostname || "";

  if (options.useEmulator === true || isLocalHostname(hostname)) {
    const protocol = options.emulatorProtocol || "http";
    const emulatorHost = formatUrlHost(options.emulatorHost || hostname || "localhost");
    const emulatorPort = options.emulatorPort || DEFAULT_FUNCTIONS_EMULATOR_PORT;

    return `${protocol}://${emulatorHost}:${emulatorPort}/${projectId}/${region}/${functionName}`;
  }

  if (options.useHostingRewrite !== false && options.useDirectFunction !== true) {
    return options.hostingRewritePath || DEEPSEEK_HOSTING_REWRITE_PATH;
  }

  return `https://${region}-${projectId}.cloudfunctions.net/${functionName}`;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array.");
  }

  return messages.map((message) => ({
    role: requireNonEmptyString(message.role || "user", "message.role"),
    content: requireNonEmptyString(message.content, "message.content")
  }));
}

function normalizeRequest(input, options = {}) {
  const request = typeof input === "string"
    ? { prompt: input }
    : { ...(input || {}) };

  if (options.systemPrompt !== undefined) {
    request.systemPrompt = options.systemPrompt;
  }

  if (options.model !== undefined) {
    request.model = options.model;
  }

  if (options.maxTokens !== undefined) {
    request.maxTokens = options.maxTokens;
  }

  if (options.temperature !== undefined) {
    request.temperature = options.temperature;
  }

  if (request.messages !== undefined) {
    request.messages = normalizeMessages(request.messages);
    return request;
  }

  request.prompt = requireNonEmptyString(request.prompt, "prompt");

  return request;
}

async function parseResponsePayload(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      rawText: text
    };
  }
}

function buildDirectFunctionUrl(options = {}) {
  return getDeepseekFunctionUrl({
    ...options,
    useDirectFunction: true,
    useHostingRewrite: false
  });
}

function isHostingRewriteEndpoint(endpointUrl) {
  return endpointUrl === DEEPSEEK_HOSTING_REWRITE_PATH;
}

function formatRawTextSnippet(rawText, maxLength = 700) {
  const text = String(rawText || "").trim();

  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

function formatPayloadDebugSnippet(payload) {
  const rawTextSnippet = formatRawTextSnippet(
    payload?.rawText ||
      payload?.retryRawText ||
      payload?.repairedRawText
  );

  if (rawTextSnippet) {
    return `Raw response: ${rawTextSnippet}`;
  }

  if (!payload?.diagnostics) {
    return "";
  }

  return `Diagnostics: ${formatRawTextSnippet(
    JSON.stringify(payload.diagnostics),
    700
  )}`;
}

function createHttpError(response, payload) {
  const baseMessage = payload?.error ||
    payload?.message ||
    `DeepSeek function request failed with HTTP ${response.status}.`;
  const payloadDebugSnippet = formatPayloadDebugSnippet(payload);
  const message = payloadDebugSnippet
    ? `${baseMessage} ${payloadDebugSnippet}`
    : baseMessage;
  const error = new Error(message);

  error.status = response.status;
  error.statusText = response.statusText;
  error.payload = payload;
  error.rawText = payload?.rawText || null;
  error.retryRawText = payload?.retryRawText || null;
  error.repairedRawText = payload?.repairedRawText || null;

  return error;
}

export class DeepseekUtil {
  constructor(options = {}) {
    this.endpointUrl = options.endpointUrl || getDeepseekFunctionUrl(options);
    this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);

    if (typeof this.fetchImpl !== "function") {
      throw new Error("fetch is not available in this browser.");
    }
  }

  async postJson(endpointUrl, body, options = {}) {
    const response = await this.fetchImpl(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: JSON.stringify(body)
    });
    const payload = await parseResponsePayload(response);

    if (!response.ok) {
      throw createHttpError(response, payload);
    }

    return payload;
  }

  async call(input, options = {}) {
    const body = normalizeRequest(input, options);

    try {
      return await this.postJson(this.endpointUrl, body, options);
    } catch (error) {
      if (
        error.status !== 404 ||
        options.allowDirectFunctionFallback === false ||
        !isHostingRewriteEndpoint(this.endpointUrl)
      ) {
        throw error;
      }

      const directFunctionUrl = buildDirectFunctionUrl(options);

      return this.postJson(directFunctionUrl, body, options);
    }
  }

  async generateText(input, options = {}) {
    const payload = await this.call(input, options);

    return payload?.json || null;
  }
}

const defaultDeepseekUtil = new DeepseekUtil();

export function callDeepseek(input, options = {}) {
  return defaultDeepseekUtil.call(input, options);
}

export function generateDeepseekText(input, options = {}) {
  return defaultDeepseekUtil.generateText(input, options);
}

export default defaultDeepseekUtil;
