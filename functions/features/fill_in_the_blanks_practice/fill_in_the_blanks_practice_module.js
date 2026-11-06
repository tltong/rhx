const {practiceType, placementSnapshot, sameSnapshot, PRE_ASSESSMENT} = require("./domain/pre_assessment");
const {randomUUID} = require("node:crypto");
const {getFirestoreDb} = require("../../utils/firebase/firebase_ops");
const {id, problem} = require("../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
function createFillInTheBlanksPracticeFeature({getDb = getFirestoreDb,
  getPassage = input => require("../fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module").getFillInTheBlanksQuestionById(input)} = {}) {
  return {
    async getFillInTheBlanksPracticeById(value) {
      const practiceId = id(typeof value === "string" ? value : value.practiceId, "practiceId");
      const snapshot = await getDb().collection("fillInTheBlanksPractices").doc(practiceId).get();
      return snapshot.exists ? {id: practiceId, practiceId, ...snapshot.data()} : null;
    },
    async createFillInTheBlanksPractice(input) {
      const passage = await getPassage(id(input.passageId, "passageId"));
      if (!passage || !passage.questions?.length) throw problem("A saved passage with questions is required.", "not-found");
      const practiceId = input.practiceId ? id(input.practiceId, "practiceId") : randomUUID();
      const {syllabusId, topicId, language, passageId, difficulty} = passage;
      const type = practiceType(input.type);
      const placement = type === PRE_ASSESSMENT ? {assessmentFrameworkId: input.assessmentFrameworkId,
        preAssessmentConfig: placementSnapshot(input.preAssessmentConfig, input.assessmentFrameworkId)} : {};
      if (type === PRE_ASSESSMENT && placement.preAssessmentConfig.preAssessment.difficultyLevel !== difficulty) throw problem("The passage does not match its pre-assessment difficulty.");
      const data = {type, ...placement, syllabusId, topicId, language, passageId, difficulty,
        questions: passage.questions.map(question => ({syllabusId, topicId, language, passageId, questionId: question.questionId}))};
      const ref = getDb().collection("fillInTheBlanksPractices").doc(practiceId);
      await getDb().runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (snapshot.exists) {
          const previous = snapshot.data();
          if (previous.passageId !== passageId || practiceType(previous.type) !== type
              || (type === PRE_ASSESSMENT && (previous.assessmentFrameworkId !== placement.assessmentFrameworkId || !sameSnapshot(previous.preAssessmentConfig, placement.preAssessmentConfig)))) {
            throw problem("This practice already references different content or placement settings.", "already-exists");
          }
          return;
        }
        tx.create(ref, {...data, dateGenerated: new Date()});
      });
      return {id: practiceId, practiceId, ...(await ref.get()).data()};
    },
  };
}
module.exports = {...createFillInTheBlanksPracticeFeature(), createFillInTheBlanksPracticeFeature};
