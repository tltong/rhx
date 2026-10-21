const {defineSecret} = require("firebase-functions/params");
const OpenAI = require("openai");
const deepseekApiKey = defineSecret("DEEPSEEK_API_KEY");
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";
const DEFAULT_THINKING_TYPE = "disabled";
const DEFAULT_MAX_TOKENS = 2048;
const DEEPSEEK_GENERATION_TIMEOUT_MS = 240000;

function normalizeMessages(body) {
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return body.messages.map((message) => ({
      role: String(message.role || "user"),
      content: String(message.content || ""),
    }));
  }

  if (!body.prompt || typeof body.prompt !== "string") {
    throw new Error("Request body must include a prompt string or a messages array.");
  }

  return [
    {
      role: "system",
      content:
        body.systemPrompt ||
        "You generate text for ReadyHeroX. Return only valid JSON. Example: {\"text\":\"your generated text\"}",
    },
    {
      role: "user",
      content: body.prompt,
    },
  ];
}

function ensureJsonInstruction(messages) {
  const hasJsonInstruction = messages.some((message) => /json/i.test(message.content));

  if (hasJsonInstruction) {
    return messages;
  }

  return [
    {
      role: "system",
      content: "Return only valid JSON. Example: {\"text\":\"your generated text\"}",
    },
    ...messages,
  ];
}

function normalizeNumber(value, fallback, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function getDeepseekClient() {
  return new OpenAI({
    baseURL: DEEPSEEK_BASE_URL,
    apiKey: deepseekApiKey.value(),
    timeout: DEEPSEEK_GENERATION_TIMEOUT_MS,
    maxRetries: 0,
  });
}

function stripJsonCodeFence(content) {
  return String(content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractFirstJsonValue(content) {
  const text = String(content || "");
  const start = text.search(/[\[{]/);

  if (start < 0) {
    return "";
  }

  const openingChar = text[start];
  const closingChar = openingChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === openingChar) {
      depth += 1;
    } else if (char === closingChar) {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return "";
}

function repairJsonCandidate(candidate) {
  return String(candidate || "")
    .trim()
    .replace(/^\uFEFF/, "")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

function parseModelJson(content) {
  const rawCandidates = [
    String(content || "").trim(),
    stripJsonCodeFence(content),
    extractFirstJsonValue(content),
  ].filter(Boolean);
  const candidates = [];

  rawCandidates.forEach((candidate) => {
    const repairedCandidate = repairJsonCandidate(candidate);

    candidates.push(candidate);

    if (repairedCandidate !== candidate) {
      candidates.push(repairedCandidate);
    }
  });

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // Try the next candidate.
    }
  }

  return null;
}

function truncateText(value, maxLength = 12000) {
  const text = String(value || "");

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n... [truncated]`;
}

async function createDeepseekCompletion({
  messages,
  maxTokens,
  temperature,
  useJsonMode = true,
  signal,
}) {
  signal?.throwIfAborted();
  const request = {
    model: DEFAULT_MODEL,
    messages,
    max_tokens: maxTokens,
    stream: false,
    thinking: { type: DEFAULT_THINKING_TYPE },
  };

  if (temperature !== undefined && temperature !== null) {
    request.temperature = temperature;
  }

  if (useJsonMode) {
    request.response_format = { type: "json_object" };
  }

  const completion = await getDeepseekClient().chat.completions.create(request, {signal});
  signal?.throwIfAborted();
  return completion;
}

function getContentPartText(part) {
  if (typeof part === "string") {
    return part;
  }

  if (!part || typeof part !== "object") {
    return "";
  }

  if (typeof part.text === "string") {
    return part.text;
  }

  if (typeof part.content === "string") {
    return part.content;
  }

  return JSON.stringify(part);
}

function getCompletionContent(completion) {
  const choice = completion?.choices?.[0] || {};
  const content = choice.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(getContentPartText).join("");
  }

  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }

  if (typeof choice.text === "string") {
    return choice.text;
  }

  return "";
}

function getCompletionDiagnostics(completion) {
  const choice = completion?.choices?.[0] || {};
  const message = choice.message || {};

  return {
    model: completion?.model || null,
    finishReason: choice.finish_reason || null,
    messageKeys: Object.keys(message),
    contentType: Array.isArray(message.content) ? "array" : typeof message.content,
    usage: completion?.usage || null,
  };
}

function buildPlainJsonRetryMessages(messages) {
  return [
    ...messages,
    {
      role: "user",
      content:
        "Retry now. Return only the JSON object requested above. The first character must be { and the last character must be }. Do not use markdown, code fences, explanations, or extra text.",
    },
  ];
}

async function repairJsonWithDeepseek({
  content,
  maxTokens,
  signal,
}) {
  const rawText = String(content || "").trim();

  if (!rawText) {
    return null;
  }

  return createDeepseekCompletion({
    maxTokens,
    signal,
    temperature: 0,
    useJsonMode: false,
    messages: [
      {
        role: "system",
        content:
          "You repair invalid JSON. Return only one strict JSON object. Use double quotes, no markdown, no comments, and no trailing commas.",
      },
      {
        role: "user",
        content: [
          "Repair this output into valid JSON while preserving the same data and structure:",
          "",
          truncateText(rawText),
        ].join("\n"),
      },
    ],
  });
}

function createDeepseekError(message, status, payload = null) {
  const error = new Error(message);

  error.status = status;
  error.payload = payload;

  return error;
}

function createDeepseekTimeoutError() {
  const error = createDeepseekError(
    "The AI service took too long to respond. Please try again.", 504,
  );
  error.name = "DeepseekTimeoutError";
  error.code = "deepseek-timeout";
  return error;
}

async function generateDeepseekJson(input, options = {}) {
  // timeoutMs is an internal server option, never read from an HTTP body.
  const timeoutMs = normalizeNumber(options.timeoutMs, DEEPSEEK_GENERATION_TIMEOUT_MS,
    1, DEEPSEEK_GENERATION_TIMEOUT_MS);
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = createDeepseekTimeoutError();
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      generateDeepseekJsonWithinDeadline(input, {...options, signal: controller.signal}),
      deadline,
    ]);
  } catch (error) {
    if (error.name === "APIConnectionTimeoutError") throw createDeepseekTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function generateDeepseekJsonWithinDeadline(input, options) {
  const reportProgress = (stage, details = {}) => {
    options.signal.throwIfAborted();
    options.onProgress?.({stage, ...details});
  };
  const body = typeof input === "string"
    ? { prompt: input }
    : { ...(input || {}) };
  const messages = ensureJsonInstruction(normalizeMessages(body));
  const maxTokens = normalizeNumber(
    options.maxTokens ?? body.maxTokens,
    DEFAULT_MAX_TOKENS,
    128,
    8192,
  );
  const temperature = normalizeNumber(
    options.temperature ?? body.temperature,
    0.3,
    0,
    2,
  );
  reportProgress("generation-started", {maxTokens});
  let completion = await createDeepseekCompletion({
    messages,
    maxTokens,
    temperature,
    signal: options.signal,
  });
  reportProgress("generation-received");
  const initialDiagnostics = getCompletionDiagnostics(completion);
  let content = getCompletionContent(completion);
  let json = parseModelJson(content);
  let retryRawText = "";
  let repairedRawText = "";
  let retryDiagnostics = null;
  let repairDiagnostics = null;

  if (json === null && !content.trim()) {
    reportProgress("json-retry-started");
    completion = await createDeepseekCompletion({
      messages: buildPlainJsonRetryMessages(messages),
      maxTokens,
      temperature: Math.min(temperature, 0.2),
      useJsonMode: false,
      signal: options.signal,
    });
    reportProgress("json-retry-received");
    retryDiagnostics = getCompletionDiagnostics(completion);
    retryRawText = getCompletionContent(completion);
    content = retryRawText;
    json = parseModelJson(content);
  }

  if (json === null && content.trim()) {
    reportProgress("json-repair-started");
    completion = await repairJsonWithDeepseek({ content, maxTokens, signal: options.signal });
    reportProgress("json-repair-received");
    repairDiagnostics = completion
      ? getCompletionDiagnostics(completion)
      : null;
    repairedRawText = completion ? getCompletionContent(completion) : "";
    content = repairedRawText;
    json = parseModelJson(content);
  }

  if (json === null) {
    const payload = {
      error: "DeepSeek did not return valid JSON.",
      rawText: content,
      retryRawText,
      repairedRawText,
      diagnostics: {
        initial: initialDiagnostics,
        retry: retryDiagnostics,
        repair: repairDiagnostics,
      },
    };

    throw createDeepseekError(payload.error, 502, payload);
  }

  reportProgress("json-validated");
  return {
    json,
    model: completion.model || DEFAULT_MODEL,
    usage: completion.usage || null,
  };
}

class DeepseekUtil {
  call(input, options = {}) {return generateDeepseekJson(input, options);}
  async generateText(input, options = {}) {return (await this.call(input, options)).json;}
}
const deepseekUtil = new DeepseekUtil();
module.exports = {DeepseekUtil, deepseekUtil, deepseekApiKey, normalizeMessages,
  generateDeepseekJson, DEEPSEEK_GENERATION_TIMEOUT_MS, DEFAULT_MODEL};
