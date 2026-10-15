import {requireStudentRewardScope} from "../domain/student_reward.js?v=20261013-recent-reward-activities-v1";
class GetStudentRewardTotal {

  constructor(repository) { this.repository = repository; }
  async execute(input) { return this.repository.getTotal(requireStudentRewardScope(input)); }
}
export {GetStudentRewardTotal};
