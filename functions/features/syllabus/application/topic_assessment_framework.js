const {createSyllabusLanguageKey, resolveTopicAssessmentFrameworkId} = require("../domain/syllabus");

function requireId(value, name) {
  if (typeof value !== "string" || !value.trim() || value.includes("/") || [".", ".."].includes(value.trim())) throw new Error(name + " must be a valid document ID.");
  return value.trim();
}

async function topicScope(repository, input, assertAccess) {
  const syllabusId = requireId(input?.syllabusId, "syllabusId");
  const topicId = requireId(input?.topicId, "topicId");
  if (typeof input?.language !== "string" || !input.language.trim()) throw new Error("language is required.");
  assertAccess();
  const syllabus = await repository.getById(syllabusId);
  assertAccess();
  if (!syllabus) throw new Error("Syllabus could not be found.");
  if (!syllabus.topics.some(topic => topic.id === topicId)) throw new Error("Topic does not belong to the syllabus.");
  const language = syllabus.languages.find(value => createSyllabusLanguageKey(value) === createSyllabusLanguageKey(input.language));
  if (!language) throw new Error("Language is not available for the syllabus.");
  return {syllabus, syllabusId, topicId, language};
}

class GetTopicAssessmentFrameworkId {
  constructor(repository) {this.repository = repository;}
  async execute(input, {assertAccess = () => {}} = {}) {
    const scope = await topicScope(this.repository, input, assertAccess);
    return resolveTopicAssessmentFrameworkId(scope.syllabus, scope);
  }
}

class AssignTopicAssessmentFramework {
  constructor({repository, getAssessmentFrameworkById}) {Object.assign(this, {repository, getAssessmentFrameworkById});}
  async execute(input, {assertAccess = () => {}} = {}) {
    const scope = await topicScope(this.repository, input, assertAccess);
    const assessmentFrameworkId = input.assessmentFrameworkId === null ? null : requireId(input.assessmentFrameworkId, "assessmentFrameworkId");
    if (assessmentFrameworkId) {
      const framework = await this.getAssessmentFrameworkById(assessmentFrameworkId);
      assertAccess();
      if (!framework) throw new Error("Assessment framework could not be found.");
    }
    await this.repository.assignTopicAssessmentFramework({...scope, assessmentFrameworkId}, {assertAccess});
    assertAccess();
    return {syllabusId: scope.syllabusId, topicId: scope.topicId, language: scope.language, assessmentFrameworkId};
  }
}

module.exports = {AssignTopicAssessmentFramework, GetTopicAssessmentFrameworkId};
