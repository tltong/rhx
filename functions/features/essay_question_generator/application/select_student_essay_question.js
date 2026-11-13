const {eligibleEssayTypeIds, chooseEssayType, normalizedTheme} = require("../../essay_config/domain/essay_type_selection");
const {questionMatchesConfiguration} = require("../../essay_config/domain/essay_config");
const {loadStudentEssayHistory} = require("../infrastructure/student_essay_history");
async function selectStudentEssayQuestion({studentId, sourceQuestion, syllabusId, topicId}, {
  api = require("../essay_question_generator_module"), history: suppliedHistory,
  seeds = require("../../question_seed_generator/question_seed_generator_module"), random = Math.random,
} = {}) {
  const config = await api.getEssayQuestionGeneratorConfig();
  const history = suppliedHistory || await loadStudentEssayHistory(studentId);
  const criteria = {level: sourceQuestion.level, standard: sourceQuestion.standard, language: sourceQuestion.language, difficulty: sourceQuestion.difficulty,
    ...(syllabusId && topicId ? {syllabusId, topicId, ...(sourceQuestion.topicName ? {topicName: sourceQuestion.topicName} : {}), ...(sourceQuestion.subject ? {subject: sourceQuestion.subject} : {})} : {})};
  const eligibleTypeIds = eligibleEssayTypeIds(config, criteria);
  const essayTypeId = chooseEssayType(eligibleTypeIds, history.typeIds, random);
  const entries = await seeds.getQuestionSeedEntries({vertical: "theme", level: criteria.level, grade: criteria.standard});
  let available = entries.map(entry => entry.value).filter(seed => !history.themes.has(normalizedTheme(seed))), fallback = !available.length;
  if (fallback) available = [await seeds.getDefaultQuestionSeedTheme()];
  const themes = new Set(available.map(normalizedTheme));
  let cursor = null, question = null, count = 0;
  if (!fallback) do {
    const page = await api.listEssayQuestions({...criteria, limit: 100, cursor});
    for (const candidate of page.questions) {
      if ((candidate.essayTypeId || "normalEssay") !== essayTypeId || history.questionIds.has(candidate.questionId)
        || !themes.has(normalizedTheme(candidate.seedUsed)) || !questionMatchesConfiguration(candidate, config)) continue;
      if (random() < 1 / ++count) question = candidate;
    }
    cursor = page.nextCursor;
  } while (cursor);
  if (!question) question = await api.generateEssayQuestion({...criteria, essayTypeId, seed: available[Math.floor(random() * available.length)]}, {updatedBy: "system:student-essay-selection"});
  return {question, selection: {questionId: question.questionId, essayTypeId, eligibleTypeIds, usedTypeIds: [...history.typeIds], seedUsed: question.seedUsed}};
}
async function prepareStudentEssayQuestion(input, {updatedBy} = {}, dependencies = {}) {
  const api = dependencies.api || require("../essay_question_generator_module");
  if (!updatedBy) throw Object.assign(new Error("Sign in before preparing an essay."), {code: "unauthenticated"});
  if (!dependencies.trusted) {
    const {getAuth} = require("firebase-admin/auth"), {getFirebaseApp, getFirestoreDb} = require("../../../utils/firebase/firebase_ops");
    const user = await getAuth(getFirebaseApp()).getUser(updatedBy);
    const linked = input.studentId === updatedBy || (await getFirestoreDb().doc(`guardianStudentLinks/${updatedBy}__${input.studentId}`).get()).data()?.state === "active";
    const admin = user.emailVerified && user.email && await require("../../site_admin/site_admin_module").isSiteAdmin(user.email);
    if (user.disabled || !linked && !admin) throw Object.assign(new Error("You cannot assign essays to this student."), {code: "permission-denied"});
  }
  const sourceQuestion = await api.getEssayQuestionById(input.questionId);
  if (!sourceQuestion) throw new Error("The source essay question could not be found.");
  return selectStudentEssayQuestion({...input, sourceQuestion}, {...dependencies, api});
}
module.exports = {selectStudentEssayQuestion, prepareStudentEssayQuestion};
