const {requireRecentStudentRewardActivitiesInput} = require("../domain/student_reward");

class ListRecentStudentRewardActivities {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    const scope = requireRecentStudentRewardActivitiesInput(input);
    return this.repository.listRecentActivities(scope);
  }
}

module.exports = {ListRecentStudentRewardActivities};
