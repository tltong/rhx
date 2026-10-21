const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {randomUUID} = require("node:crypto");

const {deepseekApiKey, normalizeMessages, DEFAULT_MODEL, DEEPSEEK_GENERATION_TIMEOUT_MS} = require("./utils/llm/deepseek_util");
const {callLlm} = require("./utils/llm/llm_util");
// Retained for existing backend imports. HTTP and feature calls share LlmUtil.
function generateDeepseekJson(input, options = {}) {return callLlm(input, {...options, provider: "deepseek"});}
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
    timeoutSeconds: 600,
  },
  async (req, res) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    let stage = "request-started";
    setCorsHeaders(req, res);
    res.set("X-Request-ID", requestId);
    res.set("Access-Control-Expose-Headers", "X-Request-ID");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Use POST to generate DeepSeek text.", requestId });
      return;
    }

    let body;

    try {
      body = parseRequestBody(req);
      normalizeMessages(body);
    } catch (error) {
      res.status(400).json({ error: error.message, requestId });
      return;
    }

    const reportProgress = ({stage: nextStage, ...details}) => {
      stage = nextStage;
      logger.info("DeepSeek request progress", {
        requestId, stage, elapsedMs: Date.now() - startedAt, ...details,
      });
    };
    reportProgress({stage, model: DEFAULT_MODEL, timeoutMs: DEEPSEEK_GENERATION_TIMEOUT_MS});
    try {
      const result = await generateDeepseekJson(body, {onProgress: reportProgress});
      reportProgress({stage: "completed"});
      res.status(200).json({...result, requestId});
    } catch (error) {
      const timedOut = error.code === "deepseek-timeout";
      const status = timedOut ? 504 : error.status === 502 ? 502 : 500;
      logger.error("DeepSeek request failed", {
        requestId, stage, elapsedMs: Date.now() - startedAt, status,
        code: error.code || null, errorName: error.name,
        errorMessage: String(error.message || "").slice(0, 500),
      });
      const payload = timedOut
        ? {error: error.message, code: "deepseek-timeout"}
        : error.payload || {error: "DeepSeek text generation failed.", message: error.message};
      res.status(status).json({...payload, requestId});
    }
  },
);

module.exports = {
  deepseekApiKey,
  generateDeepseekJson,
  generateDeepseekText,
};
