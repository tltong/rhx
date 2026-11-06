const {randomUUID} = require("node:crypto");
const core = require("./domain/fill_in_the_blanks");
const {FirestorePassageRepository} = require("./infrastructure/firestore_passage_repository");
const {requireAdministrator} = require("./infrastructure/access");
const {createPassagePictureService} = require("./infrastructure/passage_picture_service");
const {buildPassagePrompt} = require("./application/build_passage_prompt");
function createFillInTheBlanksQuestionGenerator({repository = new FirestorePassageRepository(), authorize = requireAdministrator,
  generateText = (...args) => require("../../utils/llm/llm_ops").generateLlmText(...args),
  createPicture = createPassagePictureService(), getSyllabus = input => require("../syllabus/syllabus_module").getSyllabusById(input)} = {}) {
  const api = {
    async getFillInTheBlanksQuestionGeneratorConfig() {
      const snapshot = await repository.config().get();
      return core.normaliseConfig(snapshot.exists ? snapshot.data() : {});
    },
    async saveFillInTheBlanksQuestionGeneratorConfig(input, context) {
      const updatedBy = await authorize(context), configuration = core.normaliseConfig(input);
      await repository.config().set({...configuration, updatedBy, updatedAt: new Date()});
      return configuration;
    },
    async getFillInTheBlanksQuestionById(input, options) {
      return repository.get(typeof input === "string" ? input : core.id(input.passageId, "passageId"), options);
    },
    async listFillInTheBlanksQuestions(input) {
      const criteria = core.scope(input);
      if (input.difficulty !== undefined && !core.DIFFICULTIES.includes(input.difficulty)) throw core.problem("Unknown passage difficulty.");
      return repository.list({...criteria, ...(input.difficulty ? {difficulty: input.difficulty} : {})});
    },
    async getFillInTheBlanksDraft(input, context) {
      await authorize(context);
      const snapshot = await repository.draft(input.passageId).get();
      return snapshot.exists ? core.normalisePassageAnswerLengths(snapshot.data().draft ?? null) : null;
    },
    async saveFillInTheBlanksQuestion(input, context) {
      await authorize(context);
      const snapshot = await repository.draft(input.passageId).get();
      if (!snapshot.exists || !snapshot.data().draft) throw core.problem("The generated draft could not be found.", "not-found");
      return repository.save(core.normalisePassageAnswerLengths(snapshot.data().draft));
    },
    async generateFillInTheBlanksQuestion(input, context) {
      const actor = await authorize(context), selected = core.scope(input);
      const syllabus = await getSyllabus(selected.syllabusId);
      const topic = syllabus?.topics?.find(item => item.id === selected.topicId);
      if (!topic || !syllabus.languages.some(language => core.languageKey(language) === core.languageKey(selected.language))) throw core.problem("Select a topic and language belonging to the syllabus.");
      const criteria = {...core.generationCriteria({...selected, level: syllabus.level.toLowerCase(), grade: syllabus.year, difficulty: input.difficulty}),
        subject: syllabus.subject ?? "", country: syllabus.country ?? ""};
      const passageId = input.passageId ? core.id(input.passageId, "passageId") : randomUUID();
      const existing = await repository.draft(passageId).get();
      if (existing.exists && existing.data().draft) {
        const draft = core.normalisePassageAnswerLengths(existing.data().draft);
        if (["syllabusId", "topicId", "language", "difficulty", "level", "grade"].some(key => draft[key] !== criteria[key])) throw core.problem("The draft conflicts with the requested passage.", "already-exists");
        return input.save === false ? draft : repository.save(draft);
      }
      const configuration = await api.getFillInTheBlanksQuestionGeneratorConfig();
      const settings = configuration.gradeSettings[criteria.level][criteria.grade];
      const summaries = await repository.summaries(criteria, configuration.summaryHistory);
      const prompt = buildPassagePrompt({criteria, topicName: topic.topicName, configuration, settings, summaries});
      const generated = core.validateGenerated(await generateText(prompt, {maxTokens: 8192, timeoutMs: 120000}), settings, criteria.language);
      let draft = {passageId, ...criteria, topicName: topic.topicName, ...generated, settings, questionCount: generated.questions.length,
        image: null, imageStatus: settings.imageEnabled ? "failed" : "disabled", generatedAt: new Date()};
      // Persist the text before optional image work, so an interrupted request can resume.
      await repository.draft(passageId).set({draft, createdBy: actor, createdAt: new Date()});
      if (settings.imageEnabled && draft.imagePrompt) {
        try {draft = {...draft, image: await createPicture(draft), imageStatus: "generated"};}
        catch { /* The coherent written passage remains usable. */ }
        await repository.draft(passageId).update({draft});
      }
      return input.save === false ? draft : repository.save(draft);
    },
  };
  return api;
}
module.exports = {...createFillInTheBlanksQuestionGenerator(), createFillInTheBlanksQuestionGenerator};
