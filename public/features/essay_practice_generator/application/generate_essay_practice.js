import {resolveTopicAssessmentFrameworkId} from "../../syllabus/syllabus_module.js?v=20261105-mcq-adoption-v1";
function normalizeSelection(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Essay generation input must be an object.");
  const result = {};
  for (const name of ["syllabusId", "topicId", "language"]) {
    if (typeof input[name] !== "string" || !input[name].trim()) throw new Error(name + " is required.");
    result[name] = input[name].trim();
    if (name !== "language" && (result[name].includes("/") || [".", ".."].includes(result[name]))) {
      throw new Error(name + " is not a valid document identifier.");
    }
  }
  return result;
}
class GenerateEssayPractice {
  constructor(dependencies) {Object.assign(this, dependencies);}
  async context(input) {
    const request = normalizeSelection(input);
    const syllabus = await this.getSyllabusById(request.syllabusId);
    if (!syllabus) throw new Error("Syllabus could not be found.");
    const topic = syllabus.topics.find(item => item.id === request.topicId);
    if (!topic) throw new Error("Topic does not belong to the selected syllabus.");
    const language = syllabus.languages.find(item => item.toLowerCase() === request.language.toLowerCase());
    if (!language) throw new Error("Language is not available for the selected syllabus.");
    const level = String(syllabus.level).trim().toLowerCase(), standard = Number(syllabus.year);
    if (!["primary", "secondary"].includes(level) || !Number.isInteger(standard) || standard < 1 || standard > 6) {
      throw new Error("Essay practices require a primary/secondary syllabus with grade 1-6.");
    }
    const frameworkId = resolveTopicAssessmentFrameworkId(syllabus, {topicId: topic.id, language});
    if (!frameworkId) throw new Error("Select an assessment framework for this topic and language before generating a practice.");
    const framework = await this.getAssessmentFrameworkById(frameworkId);
    if (!framework) throw new Error("The topic assessment framework could not be found.");
    if (framework.frameworkType !== "essay") throw new Error("This topic requires an essay assessment framework.");
    return {syllabus, topic, language, level, standard, framework};
  }
  async execute(input, context) {
    const request = normalizeSelection(input);
    const administrator = await this.requireAdministrator(context);
    const assertAccess = administrator.assertAccess ?? (() => {});
    const selected = await this.context(request);
    assertAccess();
    const {syllabus, topic, language, level, standard, framework} = selected;
    const firstLevel = [...framework.levels].sort((a, b) => a.sequenceOrder - b.sequenceOrder)[0];
    const difficulty = String(firstLevel?.criteria?.difficultyLevel || "").toLowerCase();
    if (!["easy", "medium", "hard"].includes(difficulty)) throw new Error("Configure the first essay framework level and its difficulty before generating a practice.");
    const seed = await this.getRandomQuestionSeedEntry({vertical: "theme", level, grade: standard});
    assertAccess();
    const question = await this.generateEssayQuestion({
      level, standard, language, difficulty, seed, save: true,
      syllabusId: syllabus.id, topicId: topic.id, topicName: topic.topicName, subject: syllabus.subject,
    }, {updatedBy: administrator.uid});
    assertAccess();
    const practice = await this.createEssayPractice({essayQuestionId: question.questionId});
    assertAccess();
    const previous = topic.getPreAssessmentPractice(language);
    const assignment = await this.assignTopicPreAssessmentPractice(
      syllabus.id, topic.id, language, practice.id, "essay", {assertAccess},
    );
    assertAccess();
    // Keep prior shared records, because already-assigned students can still reference them.
    return {syllabusId: syllabus.id, topicId: topic.id, topicName: topic.topicName, language,
      practiceType: "essay", practice, assignment, question, questions: [question],
      replacement: {replaced: Boolean(previous), previousPracticeId: previous?.practiceId ?? null}};
  }
  async load(input) {
    const {syllabus, topic, language} = await this.context(input);
    const assignment = topic.getPreAssessmentPractice(language);
    if (!assignment || assignment.practiceType !== "essay") return null;
    const practice = await this.getEssayPracticeById(assignment.practiceId);
    if (!practice) throw new Error("The attached essay practice could not be found.");
    const question = await this.getEssayQuestionById(practice.essayQuestionId);
    if (!question) throw new Error("The attached essay question could not be found.");
    return {syllabusId: syllabus.id, topicId: topic.id, topicName: topic.topicName, language,
      practiceType: "essay", assignment, practice, question, questions: [question]};
  }
}

export {GenerateEssayPractice};

