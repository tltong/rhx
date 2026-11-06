const {createHash} = require("node:crypto");
const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {questionSupportsSettings} = require("../domain/essay_question_support");
const {createDefaultConfiguration} = require("../domain/essay_question_generator_config");

// Used for a new assignment when its shared initial question predates admin settings.
// Original questions are never modified: existing assignments retain their content.
async function prepareEssayQuestion(input, {updatedBy} = {}, {api = require("../essay_question_generator_module"), getDb = getFirestoreDb} = {}) {
  if (!updatedBy) throw Object.assign(new Error("Sign in before preparing a question."), {code: "unauthenticated"});
  const source = await api.getEssayQuestionById(input?.questionId);
  if (!source) throw new Error("The essay question could not be found.");
  const config = await api.getEssayQuestionGeneratorConfig() || createDefaultConfiguration();
  const settings = config.gradeSupport[source.level][source.standard];
  if (questionSupportsSettings(source, settings)) return source;
  const criteria = {level: source.level, standard: source.standard, language: source.language, difficulty: source.difficulty};
  let cursor = null;
  do {
    const page = await api.listEssayQuestions({...criteria, limit: 100, cursor});
    const match = page.questions.find(q => q.seedUsed === source.seedUsed && questionSupportsSettings(q, settings));
    if (match) return match;
    cursor = page.nextCursor;
  } while (cursor);
  const key = createHash("sha256").update(JSON.stringify({source: source.questionId, settings})).digest("hex");
  const reference = getDb().collection("essayQuestionAssets").doc("prepare_" + key);
  const cachedId = await getDb().runTransaction(async tx => {
    const snapshot = await tx.get(reference), data = snapshot.data();
    if (data?.questionId) return data.questionId;
    if (data?.state === "processing" && data.startedAt.toMillis() > Date.now() - 600000) throw new Error("This question is being prepared. Please try again shortly.");
    tx.set(reference, {state: "processing", startedAt: new Date()});
    return null;
  });
  if (cachedId) return api.getEssayQuestionById(cachedId);
  try {
    const question = await api.generateEssayQuestion({...criteria, seed: source.seedUsed}, {updatedBy: "system:essay-settings"});
    await reference.set({state: "ready", questionId: question.questionId});
    return question;
  } catch (error) {await reference.set({state: "failed"}).catch(() => {}); throw error;}
}
module.exports = {prepareEssayQuestion};
