const {onRequest} = require("firebase-functions/v2/https");
const {getAuth} = require("firebase-admin/auth");
const logger = require("firebase-functions/logger");
const {randomUUID} = require("node:crypto");
const {getFirebaseApp} = require("./utils/firebase/firebase_ops");
const {openaiApiKey} = require("./utils/llm/openai_util");
const feature = require("./features/image_generation/image_generation_module");

function createImageGenerationHandler({verifyToken = token => getAuth(getFirebaseApp()).verifyIdToken(token, true), apis = feature, log = logger} = {}) {
  return async (req, res) => {
    const requestId = randomUUID(), startedAt = Date.now();
    res.set("Cache-Control", "no-store"); res.set("X-Request-ID", requestId);
    res.set("Access-Control-Expose-Headers", "X-Request-ID");
    if (req.method === "OPTIONS") {res.status(204).send(""); return;}
    if (req.method !== "POST") {res.status(405).json({error: {code: "invalid-method", message: "Use POST."}, requestId}); return;}
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) throw Object.assign(new Error("Sign in before using image generation."), {code: "unauthenticated"});
      const user = await verifyToken(token);
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("Provide a JSON request object."), {code: "invalid-argument"});
      const actions = {generate: "generateImage", getConfig: "getImageGenerationConfig", saveConfig: "saveImageGenerationConfig"};
      const method = Object.hasOwn(actions, body.action || "generate") ? actions[body.action || "generate"] : null;
      if (!method) throw Object.assign(new Error("Unknown image generation operation."), {code: "invalid-argument"});
      const result = await apis[method](body.input, {updatedBy: user.uid});
      log.info("Image generation operation completed", {requestId, action: body.action || "generate", elapsedMs: Date.now() - startedAt});
      res.status(200).json({result, requestId});
    } catch (error) {
      const code = String(error.code || "image-generation-failed");
      const status = code === "unauthenticated" || code.startsWith("auth/") ? 401 : code === "permission-denied" ? 403
        : code === "invalid-argument" || error instanceof SyntaxError ? 400 : error.status === 504 ? 504
          : error.status === 429 ? 429 : 502;
      const message = status === 401 ? "Sign in again before using image generation."
        : [400, 403, 504].includes(status) ? error.message : status === 429 ? "The image service is busy or its quota has been reached. Try again later."
          : "Image generation is unavailable. Check the request ID in the function logs before retrying.";
      // Never log prompts, generated data, tokens, or raw provider errors.
      log.error("Image generation operation failed", {requestId, code: status === 401 ? "unauthenticated" : code, status, elapsedMs: Date.now() - startedAt});
      res.status(status).json({error: {code: status === 401 ? "unauthenticated" : status === 400 ? "invalid-argument" : code, message}, requestId});
    }
  };
}
const generateLlmImage = onRequest({region: "us-central1", invoker: "public", memory: "1GiB", timeoutSeconds: 600,
  secrets: [openaiApiKey], cors: ["https://readyherox.web.app", "https://readyherox.firebaseapp.com", /^http:\/\/(localhost|127\.0\.0\.1):\d+$/]}, createImageGenerationHandler());
module.exports = {generateLlmImage, createImageGenerationHandler};
