import {requireRecentStudentRewardActivitiesInput} from "../domain/student_reward.js?v=20261115-news-student-v1";

class ListRecentStudentRewardActivities {
  constructor(repository) {
    this.repository = repository;
  }

  async execute(input) {
    const scope = requireRecentStudentRewardActivitiesInput(input);
    return this.repository.listRecentActivities(scope);
  }
}

export {ListRecentStudentRewardActivities};
