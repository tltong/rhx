const {requireStudentRewardCategoryScope} = require("../domain/student_reward");
class GetStudentRewardCategoryTotal {

  constructor(repository) { this.repository = repository; }
  async execute(input) { return this.repository.getCategoryTotal(requireStudentRewardCategoryScope(input)); }
}
module.exports = {GetStudentRewardCategoryTotal};
