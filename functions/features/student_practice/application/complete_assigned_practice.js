const {
  StudentPracticeCompletion,
} = require("../domain/student_practice_completion");

class CompleteAssignedPractice {
  constructor(studentPracticeRepository) {
    this.studentPracticeRepository = studentPracticeRepository;
  }

  async execute(practiceResult = {}) {
    const completion = new StudentPracticeCompletion({
      studentId: practiceResult.studentId,
      practiceId: practiceResult.practiceId,
      dateCompleted: practiceResult.submittedAt,
      questionsCorrect: practiceResult.questionsCorrect,
      totalQuestions: practiceResult.totalQuestions,
      score: practiceResult.score,
      timeTakenSeconds: practiceResult.timeTakenSeconds,
      studentAnswers: practiceResult.answers,
    });

    return this.studentPracticeRepository.complete(completion);
  }
}

module.exports = {
  CompleteAssignedPractice,
};
