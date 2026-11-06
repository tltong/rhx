import {practiceType, placementSnapshot, sameSnapshot, PRE_ASSESSMENT} from "./domain/pre_assessment.js?v=20261104-fill-preassessment-v3";
const randomUUID = () => crypto.randomUUID();
import {getFirestoreDb} from "../../utils/firebase/firebase_ops.js";
import {withAccess, dates} from "../../utils/fill_in_the_blanks/access.js?v=20261104-fill-preassessment-v3";
import {getFillInTheBlanksQuestionById} from "../fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module.js?v=20261105-chinese-count-v1";
import {id, problem} from "../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks.js?v=20261105-chinese-count-v1";
function createFillInTheBlanksPracticeFeature({getDb = getFirestoreDb,
  getPassage = getFillInTheBlanksQuestionById} = {}) {
  return {
    async getFillInTheBlanksPracticeById(value) {
      const practiceId = id(typeof value === "string" ? value : value.practiceId, "practiceId");
      const snapshot = await getDb().collection("fillInTheBlanksPractices").doc(practiceId).get();
      return snapshot.exists ? {id: practiceId, practiceId, ...dates(snapshot.data())} : null;
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
        tx.set(ref, {...data, dateGenerated: new Date()});
      });
      return {id: practiceId, practiceId, ...dates((await ref.get()).data())};
    },
  };
}
const feature = createFillInTheBlanksPracticeFeature();
export {createFillInTheBlanksPracticeFeature};
export const getFillInTheBlanksPracticeById = input => withAccess(() => feature.getFillInTheBlanksPracticeById(input));
export const createFillInTheBlanksPractice = input => withAccess(() => feature.createFillInTheBlanksPractice(input), {admin: true});
