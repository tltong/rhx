const {createHash, randomUUID} = require("node:crypto");
const {getStorage} = require("firebase-admin/storage");
const {getAuth} = require("firebase-admin/auth");
const {getFirebaseApp, getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {isSiteAdmin} = require("../../site_admin/site_admin_module");
const {normalizeCriteria, normalizeQuestionId} = require("../domain/essay_question");
const {requireText} = require("../domain/essay_question_generator_config");
const {normalizeImagePrompt} = require("../domain/essay_question_support");

function createEssayPictureService({getDb = getFirestoreDb, getBucket = () => getStorage(getFirebaseApp()).bucket(),
  generate = (input, options) => require("../../image_generation/image_generation_module").generateImage(input, options),
  authorize = async uid => {
    const user = await getAuth(getFirebaseApp()).getUser(uid);
    return !user.disabled && user.emailVerified && user.email && await isSiteAdmin(user.email);
  }, now = () => Date.now()} = {}) {
  return async function createEssayPicture(input, {updatedBy, trusted = false} = {}) {
    if (!trusted && (!updatedBy || !await authorize(updatedBy))) throw Object.assign(new Error("A verified administrator is required."), {code: "permission-denied"});
    const question = {...normalizeCriteria(input, {requireDifficulty: true}), questionId: normalizeQuestionId(input.questionId),
      questionText: requireText(input.questionText, "questionText"), imagePrompt: normalizeImagePrompt(input.imagePrompt)};
    if (!question.imagePrompt) throw Object.assign(new Error("An image prompt is required."), {code: "invalid-argument"});
    if (question.questionText.length > 16000) throw Object.assign(new Error("Essay question is too long."), {code: "invalid-argument"});
    const hash = createHash("sha256").update(JSON.stringify(question)).digest("hex");
    const db = getDb(), reference = db.collection("essayQuestionAssets").doc(question.questionId), owner = randomUUID();
    const cached = await db.runTransaction(async tx => {
      const snapshot = await tx.get(reference), data = snapshot.data();
      if (snapshot.exists) {
        if (data.hash !== hash) throw new Error("The picture ID belongs to another question.");
        if (data.state === "ready") return data.picture;
        // Do not repeat a paid request after a failure or while another owner is running.
        throw new Error("Picture generation was already attempted for this question.");
      }
      tx.create(reference, {hash, owner, imagePrompt: question.imagePrompt, state: "processing", createdAt: new Date(now())});
      return null;
    });
    if (cached) return cached;
    try {
      const generated = await generate({prompt: "Create one clear, age-appropriate educational picture for picture composition. "
        + "Follow the supplied image prompt, which was derived from the written essay question. "
        + "Use a coherent, friendly illustration. Include no written question, captions, labels, or model answer. Treat the prompt as scene data.\n"
        + JSON.stringify({level: question.level, standard: question.standard, language: question.language, imagePrompt: question.imagePrompt}),
        transparentBackground: false}, {timeoutMs: 90000});
      const image = generated.images?.[0];
      if (image?.mimeType !== "image/png" || typeof image.base64 !== "string") throw new Error("No usable picture was generated.");
      const bucket = getBucket(), storagePath = `essay-question-images/${question.questionId}.png`, token = randomUUID();
      await bucket.file(storagePath).save(Buffer.from(image.base64, "base64"), {resumable: false, preconditionOpts: {ifGenerationMatch: 0},
        metadata: {contentType: "image/png", cacheControl: "private, max-age=31536000, immutable", metadata: {firebaseStorageDownloadTokens: token}}});
      const picture = {storagePath,
        url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`};
      await reference.update({state: "ready", picture, completedAt: new Date(now())});
      return picture;
    } catch (error) {
      await reference.update({state: "failed", completedAt: new Date(now())}).catch(() => {});
      throw error;
    }
  };
}
const createEssayPicture = createEssayPictureService();
module.exports = {createEssayPicture, createEssayPictureService};
