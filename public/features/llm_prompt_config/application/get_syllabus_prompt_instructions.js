import {
  requireSyllabus
} from "./syllabus_prompt_instruction_access.js";

export class GetSyllabusPromptInstructions {
  constructor(repository, getSyllabusById) {
    this.repository = repository;
    this.getSyllabusById = getSyllabusById;
  }

  async execute(syllabusId) {
    const syllabus = await requireSyllabus(
      this.getSyllabusById,
      syllabusId
    );

    return this.repository.getSyllabusInstructions(syllabus.id);
  }
}
