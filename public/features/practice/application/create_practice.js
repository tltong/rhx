import {
  Practice
} from "../domain/practice.js?v=20260816-question-routing";

export class CreatePractice {
  constructor(practiceRepository) {
    this.practiceRepository = practiceRepository;
  }

  async execute(practiceInput) {
    const practice = new Practice(practiceInput);

    await this.practiceRepository.create(practice);

    return practice;
  }
}
