import {requireStudentRewardInput} from "../domain/student_reward.js?v=20261115-news-student-v1";
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
