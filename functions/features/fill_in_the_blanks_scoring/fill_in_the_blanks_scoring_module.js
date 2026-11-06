const {getFirestoreDb} = require("../../utils/firebase/firebase_ops");
const {guardResetTransaction, guardStudentMaintenance} = require("../../utils/student_topic_reset_guard");
const {id, problem} = require("../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
const {requireAdministrator} = require("../fill_in_the_blanks_question_generator/infrastructure/access");
const {markPassage} = require("./application/mark_passage");
function createFillInTheBlanksScoringFeature({getDb = getFirestoreDb, authorize = requireAdministrator,
  generateText = (...args) => require("../../utils/llm/llm_ops").generateLlmText(...args),
  getPassage = input => require("../fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module").getFillInTheBlanksQuestionById(input, {includeAnswers: true})} = {}) {
  const config = () => getDb().doc("fillInTheBlanksScoring/config");
  const resultRef = input => getDb().collection("fillInTheBlanksPracticeResults").doc(id(input.practiceId))
    .collection("studentSubmissions").doc(id(input.studentId));
  const api = {
    async getFillInTheBlanksScoringConfig() {return (await config().get()).data() ?? {markingInstructions: ""};},
    async saveFillInTheBlanksScoringConfig(input, context) {
      const updatedBy = await authorize(context);
      if (typeof input.markingInstructions !== "string" || input.markingInstructions.length > 20000) throw problem("Provide marking instructions of at most 20000 characters.");
      const data = {markingInstructions: input.markingInstructions, updatedBy, updatedAt: new Date()};
      await config().set(data); return data;
    },
    async getFillInTheBlanksResult(input) {
      const snapshot = await resultRef(input).get();
      return snapshot.exists ? {studentId: input.studentId, practiceId: input.practiceId, ...snapshot.data()} : null;
    },
    async scoreFillInTheBlanks(input) {
      const passage = await getPassage(id(input.passageId));
      if (!passage) throw problem("The passage could not be found.", "not-found");
      const configuration = await api.getFillInTheBlanksScoringConfig();
      return markPassage({passage, answers: input.answers, markingInstructions: configuration.markingInstructions, generateText});
    },
    async saveFillInTheBlanksResult(input, outcome, submission) {
      return getDb().runTransaction(async tx => {
        await guardResetTransaction(tx, getDb());
        await guardStudentMaintenance(tx, getDb().collection("studentPracticeResets").doc(id(input.studentId)));
        const ref = resultRef(input), source = getDb().collection("studentFillInTheBlanksPractices").doc(id(input.studentId)).collection("submissions").doc(id(input.practiceId));
        const [existing, saved] = await Promise.all([tx.get(ref), tx.get(source)]);
        if (existing.exists) return {studentId: input.studentId, practiceId: input.practiceId, ...existing.data()};
        if (!saved.exists || saved.data().leaseToken !== submission.leaseToken) throw problem("This marking attempt has been replaced. Check the saved submission.", "marking-lease-lost");
        const data = {...outcome, submittedAt: submission.submittedAt, scoredAt: new Date(), timeTakenSeconds: submission.timeTakenSeconds};
        tx.create(ref, data);
        return {studentId: input.studentId, practiceId: input.practiceId, ...data};
      });
    },
  };
  return api;
}
module.exports = {...createFillInTheBlanksScoringFeature(), createFillInTheBlanksScoringFeature};
