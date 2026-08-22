import {
  normalizeQuestionReference
} from "../domain/question.js?v=20260817-question-writes";

const PATH_FIELDS = Object.freeze([
  ["id", "id"],
  ["questionId", "id"],
  ["syllabusId", "syllabusId"],
  ["topicId", "topicId"],
  ["language", "language"],
  ["hasDiagram", "hasDiagram"]
]);

function pathValuesMatch(fieldName, requestedValue, currentValue) {
  if (fieldName === "hasDiagram") {
    return requestedValue === currentValue;
  }

  return String(requestedValue ?? "").trim()
    === String(currentValue ?? "").trim();
}

export class UpdateQuestion {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  async execute(questionReference, changes) {
    const normalizedReference = normalizeQuestionReference(
      questionReference
    );
    const question = await this.questionRepository.getById(
      normalizedReference
    );

    if (!question) {
      throw new Error("Question could not be found.");
    }

    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new Error("changes must be an object.");
    }

    PATH_FIELDS.forEach(([changeFieldName, questionFieldName]) => {
      if (
        changes[changeFieldName] !== undefined
        && !pathValuesMatch(
          changeFieldName,
          changes[changeFieldName],
          question[questionFieldName]
        )
      ) {
        throw new Error(`${changeFieldName} cannot be changed.`);
      }
    });

    question.update(changes);
    return this.questionRepository.save(question);
  }
}
