import {
  requireSyllabusTopic
} from "./syllabus_prompt_instruction_access.js";

export class GetSyllabusTopicPromptInstructions {
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
    const [syllabusInstructions, topicInstructions] = await Promise.all([
      this.repository.getSyllabusInstructions(syllabus.id),
      this.repository.getTopicInstructions(syllabus.id, topic.id)
    ]);

    return {
      syllabusId: syllabus.id,
      topicId: topic.id,
      syllabusAdditionalInstructions:
        syllabusInstructions?.additionalInstructions || "",
      topicAdditionalInstructions:
        topicInstructions?.additionalInstructions || ""
    };
  }
}
