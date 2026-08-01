import {
  SyllabusPromptInstructions
} from "../domain/syllabus_prompt_instructions.js";
import {
  requireSyllabus
} from "./syllabus_prompt_instruction_access.js";

export class SetSyllabusPromptInstructions {
  constructor(repository, getSyllabusById) {
    this.repository = repository;
    this.getSyllabusById = getSyllabusById;
  }

  async execute(syllabusId, additionalInstructions) {
    const syllabus = await requireSyllabus(
      this.getSyllabusById,
      syllabusId
    );

    return this.repository.saveSyllabusInstructions(
      new SyllabusPromptInstructions({
        syllabusId: syllabus.id,
        additionalInstructions
      })
    );
  }
}
