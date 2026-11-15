import {requireStudentRewardCategoryScope} from "../domain/student_reward.js?v=20261115-news-student-v1";
class GetStudentRewardCategoryTotal {

  constructor(repository) { this.repository = repository; }
  async execute(input) { return this.repository.getCategoryTotal(requireStudentRewardCategoryScope(input)); }
}
export {GetStudentRewardCategoryTotal};
