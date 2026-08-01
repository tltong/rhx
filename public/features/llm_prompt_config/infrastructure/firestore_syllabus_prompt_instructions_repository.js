import {
  SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION,
  SYLLABUS_PROMPT_INSTRUCTION_TOPICS_SUBCOLLECTION
} from "../../../config/firebase/syllabus_prompt_instructions_schema.js";
import {
  deleteDocument,
  readCollection,
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";
import {
  SyllabusPromptInstructions,
  TopicPromptInstructions
} from "../domain/syllabus_prompt_instructions.js";
import {
  SyllabusPromptInstructionsRepository
} from "../domain/syllabus_prompt_instructions_repository.js";

function requireIdentifier(value, fieldName) {
  const identifier = String(value ?? "").trim();

  if (!identifier) {
    throw new Error(`${fieldName} is required.`);
  }

  return identifier;
}

function getTopicsCollectionPath(syllabusId) {
  return [
    SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION,
    syllabusId,
    SYLLABUS_PROMPT_INSTRUCTION_TOPICS_SUBCOLLECTION
  ].join("/");
}

function toSyllabusInstructions(data, syllabusId) {
  if (!data) {
    return null;
  }

  return new SyllabusPromptInstructions({
    syllabusId,
    additionalInstructions: data.additionalInstructions
  });
}

function toTopicInstructions(data, syllabusId) {
  if (!data) {
    return null;
  }

  return new TopicPromptInstructions({
    syllabusId,
    topicId: data.id,
    additionalInstructions: data.additionalInstructions
  });
}

export class FirestoreSyllabusPromptInstructionsRepository
  extends SyllabusPromptInstructionsRepository {
  async getSyllabusInstructions(syllabusId) {
    const id = requireIdentifier(syllabusId, "syllabusId");
    const data = await readDocument(
      SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION,
      id
    );

    return toSyllabusInstructions(data, id);
  }

  async saveSyllabusInstructions(instructions) {
    const normalizedInstructions = instructions
      instanceof SyllabusPromptInstructions
      ? instructions
      : new SyllabusPromptInstructions(instructions);

    await writeDocument(
      SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION,
      normalizedInstructions.syllabusId,
      {
        additionalInstructions:
          normalizedInstructions.additionalInstructions
      },
      { merge: false }
    );

    return normalizedInstructions;
  }

  async deleteSyllabusInstructions(syllabusId) {
    const id = requireIdentifier(syllabusId, "syllabusId");
    const topicsPath = getTopicsCollectionPath(id);
    const topicInstructions = await readCollection(topicsPath);

    await Promise.all(topicInstructions.map((topic) => (
      deleteDocument(topicsPath, topic.id)
    )));
    await deleteDocument(SYLLABUS_PROMPT_INSTRUCTIONS_COLLECTION, id);
  }

  async getTopicInstructions(syllabusId, topicId) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireIdentifier(topicId, "topicId");
    const data = await readDocument(
      getTopicsCollectionPath(normalizedSyllabusId),
      normalizedTopicId
    );

    return toTopicInstructions(data, normalizedSyllabusId);
  }

  async listTopicInstructions(syllabusId) {
    const id = requireIdentifier(syllabusId, "syllabusId");
    const instructions = await readCollection(getTopicsCollectionPath(id));

    return instructions
      .map((data) => toTopicInstructions(data, id))
      .sort((first, second) => first.topicId.localeCompare(second.topicId));
  }

  async saveTopicInstructions(instructions) {
    const normalizedInstructions = instructions
      instanceof TopicPromptInstructions
      ? instructions
      : new TopicPromptInstructions(instructions);
    const existingSyllabusInstructions = await this.getSyllabusInstructions(
      normalizedInstructions.syllabusId
    );

    if (!existingSyllabusInstructions) {
      await this.saveSyllabusInstructions({
        syllabusId: normalizedInstructions.syllabusId,
        additionalInstructions: ""
      });
    }

    await writeDocument(
      getTopicsCollectionPath(normalizedInstructions.syllabusId),
      normalizedInstructions.topicId,
      {
        additionalInstructions:
          normalizedInstructions.additionalInstructions
      },
      { merge: false }
    );

    return normalizedInstructions;
  }

  async deleteTopicInstructions(syllabusId, topicId) {
    const normalizedSyllabusId = requireIdentifier(
      syllabusId,
      "syllabusId"
    );
    const normalizedTopicId = requireIdentifier(topicId, "topicId");

    await deleteDocument(
      getTopicsCollectionPath(normalizedSyllabusId),
      normalizedTopicId
    );
  }
}
