const {requireStudentRewardInput} = require("../domain/student_reward");
class SaveStudentReward {

  constructor(repository, authorizeWrite = () => {}) {
    this.repository = repository;
    this.authorizeWrite = authorizeWrite;
  }
  async execute(input) {
    const reward = requireStudentRewardInput(input);
    await this.authorizeWrite();
    return this.repository.save(reward);
  }
}
module.exports = {SaveStudentReward};
