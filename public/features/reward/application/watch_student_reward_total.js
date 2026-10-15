import {requireStudentRewardScope} from "../domain/student_reward.js?v=20261013-recent-reward-activities-v1";

class WatchStudentRewardTotal {
  constructor(repository) {
    if (typeof repository?.watchTotal !== "function") {
      throw new Error("A student reward repository with watchTotal is required.");
    }
    this.repository = repository;
  }

  execute(input) {
    const scope = requireStudentRewardScope(input);
    if (typeof input.onChange !== "function" || typeof input.onError !== "function") {
      throw new Error("onChange and onError must be functions.");
    }
    return this.repository.watchTotal({
      ...scope, onChange: input.onChange, onError: input.onError,
    });
  }
}

export {WatchStudentRewardTotal};
