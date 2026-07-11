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
      const completion = await getDeepseekClient().chat.completions.create({
        model,
        messages,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        temperature,
        stream: false,
      });

      const content = completion.choices?.[0]?.message?.content || "";
      let json;

      try {
        json = JSON.parse(content);
      } catch (error) {
        res.status(502).json({
          error: "DeepSeek did not return valid JSON.",
          rawText: content,
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
