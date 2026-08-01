import {
  requireSyllabusTopic
} from "./syllabus_prompt_instruction_access.js";

export class GetTopicPromptInstructions {
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

    return this.repository.getTopicInstructions(syllabus.id, topic.id);
  }
}
