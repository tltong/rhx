const {requireStudentRewardScope} = require("../domain/student_reward");
class GetStudentRewardTotal {

  constructor(repository) { this.repository = repository; }
  async execute(input) { return this.repository.getTotal(requireStudentRewardScope(input)); }
}
module.exports = {GetStudentRewardTotal};
