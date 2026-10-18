class EssayQuestionGeneratorRepository {
  async getConfig() {throw new Error("getConfig must be implemented.");}
  async saveConfig(input, options) {throw new Error("saveConfig must be implemented.");}
  createQuestionId(criteria) {throw new Error("createQuestionId must be implemented.");}
  async saveQuestion(input, options) {throw new Error("saveQuestion must be implemented.");}
  async getQuestionById(questionId) {throw new Error("getQuestionById must be implemented.");}
  async listQuestions(input) {throw new Error("listQuestions must be implemented.");}
}


export {EssayQuestionGeneratorRepository};
