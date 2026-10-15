export class StudentAssessmentProgressRepository {
  async getPracticeAssessment(input) { throw new Error("getPracticeAssessment() is not implemented."); }

  async saveAssessmentProgress(input) { throw new Error("saveAssessmentProgress() is not implemented."); }

  async getByTopic(studentId, syllabusId, topicId) {
    throw new Error("getByTopic() is not implemented.");
  }

  async savePreAssessmentProgress(progress) {
    return this.saveProgress(progress);
  }

  async saveProgress(progress) {
    throw new Error("saveProgress() is not implemented.");
  }
}
