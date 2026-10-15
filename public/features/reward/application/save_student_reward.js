import {requireStudentRewardInput} from "../domain/student_reward.js?v=20261013-recent-reward-activities-v1";
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
export {SaveStudentReward};
