import {requireSubjectScope, requireReliabilityScore} from "../domain/reliability_score.js?v=20261008-reliability-v1";

class CalculateSubjectReliabilityScore {
  constructor({getSyllabusById, getTopicReliabilityScore}) {
    this.getSyllabusById = getSyllabusById;
    this.getTopicReliabilityScore = getTopicReliabilityScore;
  }

  async execute(input) {
    const scope = requireSubjectScope(input);
    const syllabus = await this.getSyllabusById(scope.syllabusId);
    if (!syllabus) {
      const error = new Error("Syllabus " + scope.syllabusId + " was not found.");
      error.code = "not-found";
      throw error;
    }
    if (syllabus.topics.length === 0) {
      return null;
    }
    // Every current topic is in the denominator, including unpractised topics.
    const records = await Promise.all(syllabus.topics.map((topic) => (
      this.getTopicReliabilityScore({...scope, topicId: topic.id})
    )));
    const total = records.reduce((sum, record) => (
      sum + (record === null ? 0 : requireReliabilityScore(record.score))
    ), 0);
    return requireReliabilityScore(total / syllabus.topics.length);
  }
}

export {CalculateSubjectReliabilityScore};
