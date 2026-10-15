const {requireStudentRewardHistoryInput} = require("../domain/student_reward");
class ListStudentRewardHistory {

  constructor(repository) { this.repository = repository; }
  async execute(input) { return this.repository.listHistory(requireStudentRewardHistoryInput(input)); }
}
module.exports = {ListStudentRewardHistory};
