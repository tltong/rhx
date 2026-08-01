import {
  requireSyllabusTopic
} from "./syllabus_prompt_instruction_access.js";

export class DeleteTopicPromptInstructions {
  constructor(repository, getSyllabusById) {
    this.repository = repository;
    this.getSyllabusById = getSyllabusById;
  }

  async execute(syllabusId, topicId) {
    const { syllabus, topic } = await requireSyllabusTopic(
      this.getSyllabusById,
      syllabusId,
      topicId
    );

    return this.repository.deleteTopicInstructions(
      syllabus.id,
      topic.id
    );
  }
}
