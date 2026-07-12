const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const OpenAI = require("openai");

const deepseekApiKey = defineSecret("DEEPSEEK_API_KEY");

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";
const DEFAULT_MAX_TOKENS = 2048;
const ALLOWED_ORIGINS = new Set([
  "https://readyherox.web.app",
  "https://readyherox.firebaseapp.com",
]);

function isAllowedLocalOrigin(origin) {
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "");
}

function setCorsHeaders(req, res) {
  const origin = req.get("origin");

  if (!origin || ALLOWED_ORIGINS.has(origin) || isAllowedLocalOrigin(origin)) {
    res.set("Access-Control-Allow-Origin", origin || "*");
  }

  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Max-Age", "3600");
  res.set("Vary", "Origin");
}

function parseRequestBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  return req.body;
}

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
  model,
  messages,
  maxTokens,
  temperature,
  useJsonMode = true,
  thinkingType = "disabled",
}) {
  const request = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
  };

  if (useJsonMode) {
    request.response_format = { type: "json_object" };
  }

  if (thinkingType) {
    request.thinking = { type: thinkingType };
  }

  return getDeepseekClient().chat.completions.create(request);
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

async function repairJsonWithDeepseek({ model, content, maxTokens }) {
  const rawText = String(content || "").trim();

  if (!rawText) {
    return null;
  }

  return createDeepseekCompletion({
    model,
    maxTokens,
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

const generateDeepseekText = onRequest(
  {
    cors: [
      "https://readyherox.web.app",
      "https://readyherox.firebaseapp.com",
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/,
    ],
    invoker: "public",
    region: "us-central1",
    secrets: [deepseekApiKey],
  },
  async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Use POST to generate DeepSeek text." });
      return;
    }

    let body;
    let messages;

    try {
      body = parseRequestBody(req);
      messages = ensureJsonInstruction(normalizeMessages(body));
    } catch (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    const model = body.model || DEFAULT_MODEL;
    const maxTokens = normalizeNumber(body.maxTokens, DEFAULT_MAX_TOKENS, 128, 8192);
    const temperature = normalizeNumber(body.temperature, 0.3, 0, 2);

    try {
      let completion = await createDeepseekCompletion({
        model,
        messages,
        maxTokens,
        temperature,
      });
      const initialDiagnostics = getCompletionDiagnostics(completion);
      let content = getCompletionContent(completion);
      let json = parseModelJson(content);
      let retryRawText = "";
      let repairedRawText = "";
      let retryDiagnostics = null;
      let repairDiagnostics = null;

      if (json === null && !content.trim()) {
        const retryCompletion = await createDeepseekCompletion({
          model,
          messages: buildPlainJsonRetryMessages(messages),
          maxTokens,
          temperature: Math.min(temperature, 0.2),
          useJsonMode: false,
        });

        retryDiagnostics = getCompletionDiagnostics(retryCompletion);
        retryRawText = getCompletionContent(retryCompletion);
        json = parseModelJson(retryRawText);

        if (json !== null) {
          completion = retryCompletion;
          content = retryRawText;
        }
      }

      if (json === null && (retryRawText || content).trim()) {
        const repairCompletion = await repairJsonWithDeepseek({
          model,
          content: retryRawText || content,
          maxTokens,
        });

        repairDiagnostics = repairCompletion
          ? getCompletionDiagnostics(repairCompletion)
          : null;
        repairedRawText = repairCompletion
          ? getCompletionContent(repairCompletion)
          : "";
        json = parseModelJson(repairedRawText);

        if (json !== null) {
          completion = repairCompletion;
          content = repairedRawText;
        }
      }

      if (json === null) {
        res.status(502).json({
          error: "DeepSeek did not return valid JSON.",
          rawText: content,
          retryRawText,
          repairedRawText,
          diagnostics: {
            initial: initialDiagnostics,
            retry: retryDiagnostics,
            repair: repairDiagnostics,
          },
        });
        return;
      }

      res.status(200).json({
        json,
        model: completion.model || model,
        usage: completion.usage || null,
      });
    } catch (error) {
      console.error("DeepSeek request failed", error);
      res.status(500).json({
        error: "DeepSeek text generation failed.",
        message: error.message,
      });
    }
  },
);

module.exports = {
  generateDeepseekText,
};
