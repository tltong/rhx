import {
  TopicPromptInstructions
} from "../domain/syllabus_prompt_instructions.js";
import {
  requireSyllabusTopic
} from "./syllabus_prompt_instruction_access.js";

export class SetTopicPromptInstructions {
  constructor(repository, getSyllabusById) {
    this.repository = repository;
    this.getSyllabusById = getSyllabusById;
  }

  async execute(syllabusId, topicId, additionalInstructions) {
    const { syllabus, topic } = await requireSyllabusTopic(
      this.getSyllabusById,
      syllabusId,
      topicId
    );

    return this.repository.saveTopicInstructions(
      new TopicPromptInstructions({
        syllabusId: syllabus.id,
        topicId: topic.id,
        additionalInstructions
      })
    );
  }
}
