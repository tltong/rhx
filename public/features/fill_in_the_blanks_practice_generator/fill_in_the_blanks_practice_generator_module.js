import {PRE_ASSESSMENT, placementSnapshot} from "../fill_in_the_blanks_practice/domain/pre_assessment.js?v=20261104-fill-preassessment-v3";
import * as core from "../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks.js?v=20261105-chinese-count-v1";
import {requireAdministrator, withAccess} from "../../utils/fill_in_the_blanks/access.js?v=20261104-fill-preassessment-v3";
import * as syllabusFeature from "../syllabus/syllabus_module.js?v=20261105-topic-framework-v1";
import * as frameworkFeature from "../assessment_framework/assessment_framework_module.js?v=20261104-fill-preassessment-v3";
import * as questionsFeature from "../fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module.js?v=20261105-chinese-count-v1";
import * as practicesFeature from "../fill_in_the_blanks_practice/fill_in_the_blanks_practice_module.js?v=20261105-chinese-count-v1";
function createFillInTheBlanksPracticeGenerator({authorize = requireAdministrator,
  syllabus = syllabusFeature, framework = frameworkFeature,
  questions = questionsFeature,
  practices = practicesFeature} = {}) {
  return {
    async generateFillInTheBlanksPractice(input, context) {
      await authorize(context);
      const scope = core.scope(input), source = await syllabus.getSyllabusById(scope.syllabusId);
      const frameworkId = syllabus.resolveTopicAssessmentFrameworkId(source, scope);
      if (!frameworkId) throw core.problem("Configure the topic assessment framework first.", "failed-precondition");
      const assessment = await framework.getAssessmentFrameworkById(frameworkId);
      if (assessment?.frameworkType !== core.TYPE || !assessment.levels.length) throw core.problem("Select a fill-in-the-blanks framework with at least one level.", "failed-precondition");
      const snapshot = placementSnapshot(assessment, frameworkId);
      const difficulty = snapshot.preAssessment.difficultyLevel;
      const passage = await questions.generateFillInTheBlanksQuestion({...scope, difficulty}, context);
      const practice = await practices.createFillInTheBlanksPractice({passageId: passage.passageId, type: PRE_ASSESSMENT, assessmentFrameworkId: frameworkId, preAssessmentConfig: snapshot});
      const assignment = await syllabus.assignTopicPreAssessmentPractice(scope.syllabusId, scope.topicId, scope.language, practice.id, core.TYPE);
      return {...scope, topicName: source.topics.find(topic => topic.id === scope.topicId)?.topicName, practiceType: core.TYPE, practice, passage, assignment};
    },
    async loadFillInTheBlanksPractice(input) {
      const scope = core.scope(input), definition = await syllabus.getSyllabusById(scope.syllabusId);
      const attachment = definition?.topics.find(topic => topic.id === scope.topicId)?.getPreAssessmentPractice(scope.language);
      if (!attachment || attachment.practiceType !== core.TYPE) return null;
      const practice = await practices.getFillInTheBlanksPracticeById(attachment.practiceId);
      return practice ? {practice, passage: await questions.getFillInTheBlanksQuestionById(practice.passageId), assignment: attachment} : null;
    },
  };
}
const feature = createFillInTheBlanksPracticeGenerator();
export {createFillInTheBlanksPracticeGenerator};
export const generateFillInTheBlanksPractice = input => withAccess(context => feature.generateFillInTheBlanksPractice(input, context), {admin: true});
export const loadFillInTheBlanksPractice = input => withAccess(() => feature.loadFillInTheBlanksPractice(input));
