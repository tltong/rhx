const {DEFAULT_PERCENTAGE_PER_PRACTICE} = require("../../../schema/reliability_schema");
const {requirePercentagePerPractice} = require("../domain/reliability_config");
const {requireIdentifier, requireTopicScope, requireReliabilityScore} = require("../domain/reliability_score");

class CalculateTopicReliabilityScore {
  constructor({getReliabilityConfig, getSyllabusById, listCompletedPracticeIds, getPracticeById}) {
    this.getReliabilityConfig = getReliabilityConfig;
    this.getSyllabusById = getSyllabusById;
    this.listCompletedPracticeIds = listCompletedPracticeIds;
    this.getPracticeById = getPracticeById;
  }

  async execute(input) {
    const scope = requireTopicScope(input);
    const syllabus = await this.getSyllabusById(scope.syllabusId);
    if (!syllabus || !syllabus.topics.some((topic) => topic.id === scope.topicId)) {
      const error = new Error(!syllabus
        ? "Syllabus " + scope.syllabusId + " was not found."
        : "Topic " + scope.topicId + " was not found in syllabus " + scope.syllabusId + ".");
      error.code = "not-found";
      throw error;
    }
    const config = await this.getReliabilityConfig();
    const percentagePerPractice = requirePercentagePerPractice(
      config === null ? DEFAULT_PERCENTAGE_PER_PRACTICE : config.percentagePerPractice,
    );
    const completedIds = await this.listCompletedPracticeIds({studentId: scope.studentId});
    const uniqueIds = [...new Set(completedIds.map((id) => requireIdentifier(id, "practiceId")))];
    const practices = await Promise.all(uniqueIds.map((id) => this.getPracticeById(id)));
    // Practices are topic-specific. Missing or mixed-topic definitions do not contribute.
    const completedPracticeCount = practices.filter((practice) => (
      Array.isArray(practice?.questions) && practice.questions.length > 0
      && practice.questions.every((question) => (
        question?.syllabusId === scope.syllabusId && question?.topicId === scope.topicId
      ))
    )).length;

    return Object.freeze({
      score: requireReliabilityScore(Math.min(100, completedPracticeCount * percentagePerPractice)),
      completedPracticeCount,
    });
  }
}

module.exports = {CalculateTopicReliabilityScore};
