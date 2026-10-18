import {requireTopicScope, requireReadinessScore, requireTimestamp} from "../domain/readiness_score.js?v=20261018-essay-completion-metrics-v1";
import {normalizeDifficultyLevel} from "../domain/readiness_config.js?v=20261018-essay-completion-metrics-v1";

class CalculateReadinessScore {
  constructor({
    getReadinessConfig,
    listCompletedPractices,
    listCompletedEssayPractices = async () => ({practices: [], nextCursor: null}),
    getEssayResult,
    getEssayQuestionById,
    getPracticeById,
    getQuestionDifficulty,
    assessmentPracticeType,
    preAssessmentPracticeType,
  }) {
    this.getReadinessConfig = getReadinessConfig;
    this.listCompletedPractices = listCompletedPractices;
    Object.assign(this, {listCompletedEssayPractices, getEssayResult, getEssayQuestionById});
    this.getPracticeById = getPracticeById;
    this.getQuestionDifficulty = getQuestionDifficulty;
    this.assessmentPracticeType = assessmentPracticeType;
    this.preAssessmentPracticeType = preAssessmentPracticeType;
  }

  async execute(input) {
    const scope = requireTopicScope(input);
    // Use a single configuration snapshot for the count and every weight.
    const config = await this.getReadinessConfig();
    if (!config) {
      const error = new Error("Readiness has not been configured.");
      error.code = "failed-precondition";
      throw error;
    }
    const completions = (await this.listCompletedPractices({studentId: scope.studentId})).map(
      completion => ({...completion, kind: "normal"}),
    );
    let cursor = null;
    do {
      const page = await this.listCompletedEssayPractices({...scope, limit: 100, cursor});
      for (const completion of page.practices) {
        if (completion.syllabusId === scope.syllabusId && completion.topicId === scope.topicId) {
          completions.push({...completion, kind: "essay", practiceId: completion.essayPracticeId, dateCompleted: completion.completedAt});
        }
      }
      cursor = page.nextCursor;
    } while (cursor);
    const newestFirst = [...completions].sort((first, second) => (
      requireTimestamp(second.dateCompleted, "dateCompleted").getTime()
        - requireTimestamp(first.dateCompleted, "dateCompleted").getTime()
        || first.practiceId.localeCompare(second.practiceId)
        || first.kind.localeCompare(second.kind)
    ));
    const weightedScores = [];
    const essayResults = new Map();

    for (const completion of newestFirst) {
      if (completion.kind === "essay") {
        if (!essayResults.has(completion.essayQuestionId)) {
          essayResults.set(completion.essayQuestionId, await this.getEssayResult({studentId: scope.studentId, questionId: completion.essayQuestionId}));
        }
        const result = essayResults.get(completion.essayQuestionId);
        // Submitted essays count toward readiness only once their exact answer is graded.
        if (!result || result.answer !== completion.essayText) continue;
        const question = await this.getEssayQuestionById(completion.essayQuestionId);
        if (!question) throw new Error("A completed essay question could not be found.");
        const difficulty = normalizeDifficultyLevel(question.difficulty);
        weightedScores.push(requireReadinessScore(result.score) * config.difficultyWeights[difficulty]);
        if (weightedScores.length === config.numberOfPractices) break;
        continue;
      }
      const practice = await this.getPracticeById(completion.practiceId);
      const questions = practice?.questions;
      if (!Array.isArray(questions) || questions.length === 0
          || !questions.every((question) => (
            question.syllabusId === scope.syllabusId && question.topicId === scope.topicId
          ))) {
        continue;
      }

      let weight;
      if (practice.type === this.preAssessmentPracticeType) {
        weight = config.preAssessmentWeight;
      } else if (practice.type === this.assessmentPracticeType) {
        // Normal assessments use a single difficulty, as in assessment progression.
        const difficulty = normalizeDifficultyLevel(
          await this.getQuestionDifficulty(questions[0]),
        );
        weight = config.difficultyWeights[difficulty];
      } else {
        throw new Error(`Practice ${completion.practiceId} has an unsupported practice type.`);
      }

      // Completion scores are already derived and validated from correct/total answers.
      weightedScores.push(requireReadinessScore(completion.score) * weight);
      if (weightedScores.length === config.numberOfPractices) {
        break;
      }
    }

    if (weightedScores.length === 0) {
      return null;
    }
    return requireReadinessScore(
      weightedScores.reduce((sum, score) => sum + score, 0) / weightedScores.length,
    );
  }
}

export {CalculateReadinessScore};
