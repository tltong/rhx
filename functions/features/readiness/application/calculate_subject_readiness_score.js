const {requireSubjectScope, requireReadinessScore} = require("../domain/readiness_score");

class CalculateSubjectReadinessScore {
  constructor({getSyllabusById, getReadinessScore}) {
    this.getSyllabusById = getSyllabusById;
    this.getReadinessScore = getReadinessScore;
  }

  async execute(input) {
    const scope = requireSubjectScope(input);
    const syllabus = await this.getSyllabusById(scope.syllabusId);
    if (!syllabus) {
      const error = new Error(`Syllabus ${scope.syllabusId} was not found.`);
      error.code = "not-found";
      throw error;
    }

    // Only current syllabus topics contribute; historical or removed topics do not.
    const records = await Promise.all(syllabus.topics.map((topic) => (
      this.getReadinessScore({...scope, topicId: topic.id})
    )));
    const scores = records.filter((record) => record !== null)
      .map((record) => requireReadinessScore(record.score));
    if (scores.length === 0) {
      return null;
    }
    return requireReadinessScore(
      scores.reduce((sum, score) => sum + score, 0) / scores.length,
    );
  }
}

module.exports = {CalculateSubjectReadinessScore};
