import {requireStudentRewardHistoryInput} from "../domain/student_reward.js?v=20261013-recent-reward-activities-v1";
class ListStudentRewardHistory {

  constructor(repository) { this.repository = repository; }
  async execute(input) { return this.repository.listHistory(requireStudentRewardHistoryInput(input)); }
}
export {ListStudentRewardHistory};
