const {onRequest} = require("firebase-functions/v2/https");
const {getAuth} = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");
const {randomUUID} = require("node:crypto");
const {getFirebaseApp} = require("./utils/firebase/firebase_ops");
const {deepseekApiKey} = require("./utils/llm/deepseek_util");
const {openaiApiKey} = require("./utils/llm/openai_util");
const feature = require("./features/image_ocr/image_ocr_module");

function createImageOcrHandler({verifyToken = token => getAuth(getFirebaseApp()).verifyIdToken(token, true), apis = feature, log = logger} = {}) {
  return async (req, res) => {
    const requestId = randomUUID(), startedAt = Date.now();
    res.set("Cache-Control", "no-store"); res.set("X-Request-ID", requestId); res.set("Access-Control-Expose-Headers", "X-Request-ID");
    if (req.method === "OPTIONS") {res.status(204).send(""); return;}
    if (req.method !== "POST") {res.status(405).json({error: {code: "invalid-method", message: "Use POST."}, requestId}); return;}
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) throw Object.assign(new Error("Sign in before extracting image text."), {code: "unauthenticated"});
      const user = await verifyToken(token);
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("Provide a JSON request object."), {code: "invalid-argument"});
      const actions = {extract: "extractTextFromImage", getConfig: "getImageOcrConfig", saveConfig: "saveImageOcrConfig", test: "testImageOcr"};
      const action = body.action === undefined ? "extract" : body.action;
      if (typeof action !== "string" || !Object.hasOwn(actions, action)) throw Object.assign(new Error("Unknown OCR operation."), {code: "invalid-argument"});
      const result = await apis[actions[action]](body.input, {updatedBy: user.uid});
      log.info("OCR operation completed", {requestId, action, elapsedMs: Date.now() - startedAt});
      res.status(200).json({result, requestId});
    } catch (error) {
      const code = String(error.code || "ocr-failed");
      const status = code === "unauthenticated" || code.startsWith("auth/") ? 401 : code === "permission-denied" ? 403
        : code === "invalid-argument" || error instanceof SyntaxError ? 400 : error.status === 504 ? 504 : error.status === 429 ? 429 : 502;
      const safeCode = status === 401 ? "unauthenticated" : status === 400 ? "invalid-argument" : code;
      const message = status === 401 ? "Sign in again before extracting image text." : [400, 403, 504].includes(status) || ["ocr-output-truncated", "ocr-refused"].includes(code) ? error.message
        : status === 429 ? "The OCR service is busy or its quota has been reached. Try again later." : "OCR is unavailable. Check the request ID in the function logs before retrying.";
      log.error("OCR operation failed", {requestId, code: safeCode, status, elapsedMs: Date.now() - startedAt});
      res.status(status).json({error: {code: safeCode, message}, requestId});
    }
  };
}
const extractLlmImageText = onRequest({region: "us-central1", invoker: "public", memory: "1GiB", concurrency: 8,
  timeoutSeconds: 600, secrets: [deepseekApiKey, openaiApiKey],
  cors: ["https://readyherox.web.app", "https://readyherox.firebaseapp.com", /^http:\/\/(localhost|127\.0\.0\.1):\d+$/]}, createImageOcrHandler());
module.exports = {extractLlmImageText, createImageOcrHandler};
