const {problem, clean} = require("../domain/subject_assessment");
const {resultSummary, normalizeAnswers} = require("../domain/subject_assessment_submission");

class MarkSubjectAssessment {
  constructor(dependencies) {Object.assign(this, dependencies);}
  async item(assessment, item, answer, settings) {
    const base = {position: item.position, topicId: item.topicId, topicName: item.topicName, questionType: item.questionType, difficulty: item.difficulty};
    if (item.questionType === "normal") {
      const correctAnswer = item.marking?.correctAnswer;
      if (!["a", "b", "c", "d"].includes(correctAnswer)) throw problem("The assessment answer key is missing.", "failed-precondition");
      const isCorrect = answer.selectedOption === correctAnswer;
      return {...base, questionCount: 1, earnedMarks: isCorrect ? 1 : 0, maxMarks: 1, score: isCorrect ? 100 : 0,
        answer: {...answer, correctAnswer, isCorrect, explanation: item.marking.explanation || ""}};
    }
    if (item.questionType === "essay") {
      let outcome;
      if (!answer.answer.trim()) outcome = {score: 0, reviewComment: "No answer was submitted.", corrections: []};
      else {
        const legacy = item.sourceReference?.match(/^essayQuestionGenerator\/(primary|secondary)\/standards\/([1-6])\//);
        const context = item.contentSnapshot.context || assessment.contextSnapshot || (legacy ? {level: legacy[1], grade: Number(legacy[2])} : null);
        if (!["primary", "secondary"].includes(context?.level) || !Number.isSafeInteger(context?.grade) || context.grade < 1 || context.grade > 6) {
          throw problem("This assessment is missing its frozen marking grade. Generate a new assessment.", "failed-precondition");
        }
        outcome = await this.scoreEssay({question: {...item.contentSnapshot, level: context.level, standard: context.grade,
          difficulty: item.difficulty, language: assessment.language}, answer: answer.answer, configuration: settings.essay});
      }
      return clean({...base, questionCount: 1, earnedMarks: outcome.score / 100, maxMarks: 1, score: outcome.score,
        answer: {answer: answer.answer, ...outcome}});
    }
    const context = item.contentSnapshot.context || assessment.contextSnapshot || {};
    const questions = item.contentSnapshot.questions.map(question => ({...question, correctAnswer: item.marking?.answers?.[question.questionId]}));
    const outcome = await this.markPassage({passage: {...item.contentSnapshot, questions, grade: context.grade,
      difficulty: item.difficulty, topicId: item.topicId, topicName: item.topicName, subject: context.subject || "", language: assessment.language},
    answers: answer.answers, markingInstructions: settings.fill?.markingInstructions || "", generateText: this.generateText});
    return clean({...base, questionCount: outcome.totalQuestions, earnedMarks: outcome.questionsCorrect, maxMarks: outcome.totalQuestions,
      score: outcome.score, answer: outcome});
  }
  async execute(assessmentId, {markingRequest} = {}) {
    const started = Date.now(), state = await this.repository.claimMarking(assessmentId, markingRequest);
    if (!state) return null;
    try {
      const assessment = await this.assessments.getForMarking(assessmentId);
      const answers = new Map(normalizeAnswers(assessment, state.submission.items, {final: true}).map(item => [item.position, item]));
      const settings = state.settings || await this.repository.freezeMarkingSettings(state, await this.loadSettings());
      const items = [];
      for (const item of assessment.items) {
        await this.repository.renew(state);
        let result = await this.repository.markedItem(state, item.position);
        const alreadyMarked = !!result;
        if (!result) {
          const answer = answers.get(item.position);
          if (!answer) throw problem("The saved submission is incomplete.", "failed-precondition");
          result = await this.item(assessment, item, answer, settings);
          await this.repository.saveMarkedItem(state, result);
        }
        items.push(result);
        if (!alreadyMarked && items.length < assessment.items.length && Date.now() - started > (this.maxRunMs ?? 300000)) return this.repository.queueContinuation(state);
      }
      const summary = resultSummary(items, settings.policy);
      return await this.repository.publishResult(state, items, summary);
    } catch (error) {
      await this.repository.failMarking(state, error).catch(() => {});
      throw error;
    }
  }
}
module.exports = {MarkSubjectAssessment};
