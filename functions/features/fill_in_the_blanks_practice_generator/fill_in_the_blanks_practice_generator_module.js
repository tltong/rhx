const {PRE_ASSESSMENT, placementSnapshot} = require("../fill_in_the_blanks_practice/domain/pre_assessment");
const core = require("../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
const {requireAdministrator} = require("../fill_in_the_blanks_question_generator/infrastructure/access");
function createFillInTheBlanksPracticeGenerator({authorize = requireAdministrator,
  syllabus = require("../syllabus/syllabus_module"), framework = require("../assessment_framework/assessment_framework_module"),
  questions = require("../fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module"),
  practices = require("../fill_in_the_blanks_practice/fill_in_the_blanks_practice_module")} = {}) {
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
module.exports = {...createFillInTheBlanksPracticeGenerator(), createFillInTheBlanksPracticeGenerator};
