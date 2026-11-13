const {getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
const {typeSelectionAllowed, normalizedTheme} = require("../../essay_config/domain/essay_type_selection");
const {fail, documentId} = require("../../essay_config/domain/essay_config");
async function readAll(query) {
  const result = []; let after;
  do {
    const page = await (after ? query.orderBy("__name__").startAfter(after).limit(100) : query.orderBy("__name__").limit(100)).get();
    result.push(...page.docs); after = page.docs.length === 100 ? page.docs.at(-1) : null;
  } while (after);
  return result;
}
async function loadStudentEssayHistory(studentId, {getDb = getFirestoreDb, getQuestion} = {}) {
  if (typeof studentId !== "string" || !studentId || studentId.includes("/")) throw fail("A valid student ID is required.");
  const db = getDb(), root = db.collection("studentEssayPractices").doc(studentId);
  const [assigned, completed, usage, types, assessmentUsage] = await Promise.all([
    readAll(root.collection("assignedEssayPractices")), readAll(root.collection("completedEssayPractices")),
    readAll(root.collection("questionUsage")), readAll(root.collection("typeHistory")),
    readAll(db.collection("studentSubjectAssessmentUsage").doc(studentId).collection("items")),
  ]);
  const questionIds = new Set(), typeIds = new Set(types.map(doc => doc.id)), themes = new Set(), pending = new Map();
  function add(questionId, data) {
    if (!questionId) return;
    questionIds.add(questionId);
    if (data.essayTypeId && typeof data.seedUsed === "string") {
      typeIds.add(data.essayTypeId); themes.add(normalizedTheme(data.seedUsed));
    } else pending.set(questionId, data);
  }
  for (const doc of [...assigned, ...completed]) add(doc.data().essayQuestionId, doc.data());
  for (const doc of usage) add(doc.id, doc.data());
  for (const doc of assessmentUsage) if (doc.data().questionType === "essay" || doc.data().identity?.startsWith("essay:")) {
    add(doc.data().identity?.slice(6), doc.data());
  }
  getQuestion ||= id => require("../essay_question_generator_module").getEssayQuestionById(id);
  for (const [id, data] of pending) {
    const question = data.questionSnapshot || await getQuestion(id);
    if (!question) throw fail("An essay question referenced by student history is missing.", "failed-precondition");
    typeIds.add(question.essayTypeId || "normalEssay");
    themes.add(normalizedTheme(question.seedUsed));
  }
  return {questionIds, typeIds, themes};
}
// Read before any transaction writes. All assignment paths share this per-student history.
async function checkStudentEssayTypes(tx, db, studentId, selections) {
  const maintenance = await tx.get(db.collection("essayConfig").doc("poolMaintenance"));
  if (maintenance.data()?.active) throw fail("The essay pool is being cleared. Retry shortly.", "unavailable");
  const ids = [...new Set(selections.flatMap(item => item.eligibleTypeIds))];
  const root = db.collection("studentEssayPractices").doc(studentId).collection("typeHistory");
  const snapshots = await Promise.all(ids.map(id => tx.get(root.doc(documentId(id)))));
  const usage = db.collection("studentEssayPractices").doc(studentId).collection("questionUsage");
  const questionIds = selections.map(item => item.questionId).filter(Boolean);
  const pool = db.collection("essayQuestionGenerator").doc("questionIndex").collection("entries");
  const active = await Promise.all(questionIds.map(id => tx.get(pool.doc(id))));
  if (active.some(doc => !doc.exists)) throw fail("A selected essay question was cleared from the reusable pool. Retry selection.", "essay-question-not-in-pool");
  const questions = await Promise.all(questionIds.map(id => tx.get(usage.doc(id))));
  if (new Set(questionIds).size !== questionIds.length || questions.some(doc => doc.exists)) throw fail("This essay question was already assigned to the student.", "essay-question-already-used");
  const used = new Set(snapshots.filter(doc => doc.exists).map(doc => doc.id));
  for (const item of selections) {
    for (const id of item.usedTypeIds || []) used.add(id);
    if (!typeSelectionAllowed(item.eligibleTypeIds, used, item.essayTypeId)) throw fail("Essay type history changed during selection. Retry to choose an unused type.", "essay-type-selection-conflict");
    used.add(item.essayTypeId);
  }
  return () => {
    for (const id of new Set(selections.map(item => item.essayTypeId))) if (!snapshots.find(doc => doc.id === id)?.exists) tx.set(root.doc(documentId(id)), {firstAssignedAt: new Date()});
    for (const item of selections) if (item.questionId) tx.set(usage.doc(item.questionId), {essayTypeId: item.essayTypeId, seedUsed: item.seedUsed || "", assignedAt: new Date()});
  };
}
module.exports = {loadStudentEssayHistory, checkStudentEssayTypes, readAll};
