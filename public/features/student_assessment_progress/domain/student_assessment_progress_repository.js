export class StudentAssessmentProgressRepository {
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
