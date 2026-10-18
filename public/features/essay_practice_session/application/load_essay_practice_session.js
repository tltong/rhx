class LoadEssayPracticeSession {
  constructor({getAssignedEssayPractice, getCompletedEssayPractice, getEssayQuestionById, getEssayResult}) {
    Object.assign(this, {getAssignedEssayPractice, getCompletedEssayPractice, getEssayQuestionById, getEssayResult});
  }

  async execute(input, {assertAccess = () => {}} = {}) {
    assertAccess();
    let practice = await this.getCompletedEssayPractice(input);
    let status = "completed";
    if (!practice) {
      status = "assigned";
      practice = await this.getAssignedEssayPractice(input);
      // Completion can move the assignment between the two reads.
      if (!practice) {
        practice = await this.getCompletedEssayPractice(input);
        status = "completed";
      }
    }
    assertAccess();
    if (!practice) throw new Error("This essay practice is not assigned to this student and has no saved submission.");
    const [question, savedResult] = await Promise.all([
      this.getEssayQuestionById(practice.essayQuestionId),
      status === "completed" ? this.getEssayResult({studentId: practice.studentId, questionId: practice.essayQuestionId}) : null,
    ]);
    assertAccess();
    if (!question) throw new Error("The essay question could not be found.");
    // Results belong to a student/question. Never show a grade for a different answer.
    const result = savedResult?.answer === practice.essayText ? savedResult : null;
    return Object.freeze({status, practice, question, result});
  }
}

export {LoadEssayPracticeSession};
