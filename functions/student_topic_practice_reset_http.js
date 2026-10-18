const {onRequest} = require("firebase-functions/v2/https");
const {getAuth} = require("firebase-admin/auth");
const firebaseOps = require("./utils/firebase/firebase_ops");
const feature = require("./features/student_topic_practice_reset/student_topic_practice_reset_module");

function createStudentTopicResetHandler({verifyToken = token => getAuth(firebaseOps.getFirebaseApp()).verifyIdToken(token, true), apis = feature} = {}) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "POST") {res.status(405).json({error: {code: "invalid-method", message: "Use POST."}}); return;}
    try {
      const bearer = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
      if (!bearer) throw Object.assign(new Error("Sign in with a site-administrator account."), {code: "unauthenticated"});
      const user = await verifyToken(bearer);
      if (!user.email_verified) throw Object.assign(new Error("Verify your email before resetting student work."), {code: "permission-denied"});
      const actions = {preview: "previewStudentTopicPracticeReset", request: "requestStudentTopicPracticeReset", status: "getStudentTopicPracticeResetStatus"};
      const name = Object.hasOwn(actions, req.body?.action) ? actions[req.body.action] : null;
      if (!name) throw Object.assign(new Error("Unknown topic reset operation."), {code: "invalid-argument"});
      const result = await apis[name](req.body.input, {updatedBy: user.uid});
      res.status(200).json({result});
    } catch (error) {
      const code = error.code ?? "reset-failed";
      const status = code === "unauthenticated" || String(code).startsWith("auth/") ? 401
        : code === "permission-denied" ? 403 : ["reset-in-progress", "already-exists"].includes(code) ? 409 : code === "not-found" ? 404
          : ["invalid-argument", "failed-precondition"].includes(code) ? 400 : 500;
      res.status(status).json({error: {code, message: error.message, ...(error.resetId ? {resetId: error.resetId} : {})}});
    }
  };
}
const studentTopicPracticeReset = onRequest({region: "us-central1", memory: "512MiB", timeoutSeconds: 540, cors: true}, createStudentTopicResetHandler());
module.exports = {studentTopicPracticeReset, createStudentTopicResetHandler};
