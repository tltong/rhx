export class Question {
  constructor({
    id = null,
    syllabusId,
    topicId,
    topicName,
    questionText,
    options,
    correctAnswer,
    difficulty,
    specialInstruction = "",
    language
  }) {
    this.id = id;
    this.syllabusId = syllabusId;
    this.topicId = topicId;
    this.topicName = topicName;
    this.questionText = questionText;
    this.options = options;
    this.correctAnswer = correctAnswer;
    this.difficulty = difficulty;
    this.specialInstruction = specialInstruction;
    this.language = language;
  }
}
