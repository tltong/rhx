const {randomBytes, randomUUID} = require("node:crypto");
const {createTestSystem} = require("../../../tests/news_test_support.cjs");
const {FirestoreDemoRepository} = require("./infrastructure/firestore_demo_repository");
const {createDemoContentGateway} = require("./infrastructure/demo_content_gateway");
const {createDemoService} = require("./application/demo_service");
const {createDemoNews} = require("./application/demo_news");
const {resolveTopicAssessmentFrameworkId} = require("../syllabus/domain/syllabus");
const {DEFAULT_IMAGE_SETTINGS} = require("../../utils/llm/image_generation_settings");
const {FirestoreTutorMiniQuestionSetRepository} = require("../tutor/infrastructure/firestore_tutor_mini_question_set_repository");
const {tutorGuideId, requireTutorGuideForQuestion} = require("../tutor/domain/tutor_guide_version");
const d = require("./domain/demo");
const token = () => randomBytes(32).toString("base64url");
function topic(id, name, frameworkId, attachment = null) {
  return {id, topicName: name, tutorEnabled: true, assessmentFrameworkIds: {english: frameworkId}, getPreAssessmentPractice: () => attachment};
}
async function createDemoTestSystem(projectId) {
  const newsSystem = await createTestSystem(projectId), {db, now} = newsSystem;
  const repository = new FirestoreDemoRepository({getDb: () => db, now});
  const state = {pool: [], batches: [], failMarking: false, tutorEnabled: true, generationGate: null, reward: 20,
    tutorInstructions: "initial", tutorAnswers: ["2", "3"]};
  const fixtures = [
    {id: "math", active: true, country: "Malaysia", level: "primary", year: 4, subject: "Mathematics", languages: ["English"],
      topics: [topic("fractions", "Fractions", "mcq")]},
    {id: "english", active: true, country: "Malaysia", level: "primary", year: 4, subject: "English", languages: ["English"],
      topics: [topic("writing", "Writing", "essay", {practiceType: "essay", practiceId: "writing-practice"}),
        topic("grammar", "Grammar", "fill", {practiceType: "fillInTheBlanks", practiceId: "grammar-practice"})]},
    {id: "inactive", active: false, country: "Malaysia", level: "primary", year: 4, subject: "Inactive", languages: [], topics: []},
    {id: "other-country", active: true, country: "Singapore", level: "primary", year: 4, subject: "Other country", languages: [], topics: []},
  ];
  const essay = {questionId: "writing-question", level: "primary", standard: 4, language: "English", difficulty: "medium",
    questionText: "Write a story about a discovery.", wordCountRequirement: {minWords: 3}};
  const passage = {passageId: "grammar-passage", language: "English", difficulty: "medium", grade: 4,
    passageText: "Maya {{q1}} to school. She enjoys {{q2}}.", questions: [
      {questionId: "q1", position: 1, requiredWordCount: 1, correctAnswer: "walks"},
      {questionId: "q2", position: 2, requiredWordCount: 1, correctAnswer: "reading"},
    ]};
  state.passages = [passage, ...["easy", "hard"].map(difficulty => ({...passage, passageId: "grammar-" + difficulty, difficulty}))];
  function bankQuestion(index, input = {}) {
    return {id: "question-" + index, syllabusId: "math", topicId: "fractions", language: "English",
      difficulty: "medium", group: "assessment", hasDiagram: false, questionText: "What is " + index + " + 1?",
      options: {a: String(index + 1), b: String(index + 2), c: "0", d: "-1"}, correctAnswer: "a", explanation: "Add one.", ...input};
  }
  const syllabuses = {listSyllabuses: async () => fixtures, getSyllabusById: async id => fixtures.find(item => item.id === id),
    resolveTopicAssessmentFrameworkId, isTopicTutorEnabled: async () => state.tutorEnabled};
  const tutorSets = new FirestoreTutorMiniQuestionSetRepository({
    readDocument: async (collection, id) => (await db.collection(collection).doc(id).get()).data() || null,
    writeDocument: (collection, id, value) => db.collection(collection).doc(id).set(value),
    createDocumentIfAbsent: (collection, id, value) => db.collection(collection).doc(id).create(value),
    serverTimestamp: now,
  });
  const content = createDemoContentGateway({
    tutorSets,
    syllabuses, scopes: {listSyllabusScopes: async () => [{country: "Malaysia", levels: {primary: {4: true}}}]},
    frameworks: {getAssessmentFrameworkById: async id => ({id, frameworkType: {mcq: "normal", essay: "essay", fill: "fillInTheBlanks"}[id],
      levels: [{sequenceOrder: 1, criteria: {difficultyLevel: "medium"}}]})},
    questions: {listQuestionsByTopic: async (_syllabus, _topic, options) => state.pool.filter(q => q.difficulty === options.difficulty && q.hasDiagram === options.hasDiagram).slice(0, options.limit)},
    generators: {generateQuestions: async (_config, _syllabus, input) => {
      state.batches.push(input.numberOfQuestions); if (state.generationGate) await state.generationGate;
      for (let i = 0; i < input.numberOfQuestions; i++) state.pool.push(bankQuestion(state.pool.length + 1, {difficulty: input.difficultyLevel}));
    }},
    promptConfigs: {getDefaultLlmPromptConfig: async () => ({id: "default"})},
    essays: {getEssayQuestionById: async () => essay, isEssayQuestionRetired: async () => false, getRandomEssayQuestion: async () => essay},
    essayPractices: {getEssayPracticeById: async () => ({essayQuestionId: essay.questionId})},
    essayScoring: {getEssayScoringConfig: async () => ({markingInstructions: "configured"}), scoreEssaySnapshot: async input => {
      if (state.failMarking) throw Error("Temporary scoring failure");
      if (input.question.questionId !== essay.questionId) throw Error("Wrong essay snapshot");
      return {score: 85, reviewComment: "Your story has a clear opening.", corrections: []};
    }},
    passages: {getFillInTheBlanksQuestionById: async (id, options) => {
      if (!options?.includeAnswers) throw Error("The demo must request the private grading snapshot server-side");
      return state.passages.find(item => item.passageId === id) || null;
    }, listFillInTheBlanksQuestions: async input => state.passages.filter(item => item.difficulty === input.difficulty)},
    fillPractices: {getFillInTheBlanksPracticeById: async () => ({passageId: passage.passageId})},
    fillScoring: {getFillInTheBlanksScoringConfig: async () => ({markingInstructions: "configured"})},
    rewards: {getRewardConfig: async () => ({bonusMissionCompletionCoins: state.reward})},
    tutor: {getTutorConfig: async () => ({correctAnswerMessage: {English: "Correct"}, incorrectAnswerMessage: {English: "Try again"}}),
      createTutorReviewForQuestion: loader => ({
        getTutorMiniQuestionSet: async input => {
          const question = await loader(input.questionId), guideId = await tutorGuideId(question, {promptInstructions: state.tutorInstructions});
          const reference = {questionId: guideId, language: input.language, miniQuestionCount: 2};
          const set = await tutorSets.get(reference, {allowLegacy: false}) || await tutorSets.save({...reference, configUpdatedAt: now(),
            miniQuestions: [{sequence: 1, questionText: "What is one plus one?", expectedAnswer: state.tutorAnswers[0], acceptedAnswers: [state.tutorAnswers[0]], answerExplanation: "Add one and one."},
              {sequence: 2, questionText: "What is two plus one?", expectedAnswer: state.tutorAnswers[1], acceptedAnswers: [state.tutorAnswers[1]], answerExplanation: "Add two and one."}]}, {createOnly: true});
          return {...set, questionId: input.questionId, guideId};
        },
        checkTutorMiniQuestionAnswer: async input => {
          await requireTutorGuideForQuestion(input.guideId, await loader(input.questionId));
          const set = await tutorSets.get({questionId: input.guideId, language: input.language, miniQuestionCount: input.miniQuestionCount}, {allowLegacy: false});
          return {isCorrect: input.answer === set.miniQuestions[input.sequence - 1].expectedAnswer};
        },
      })},
    generateText: async prompt => {const input = JSON.parse(prompt.slice(prompt.lastIndexOf("\n") + 1)); return {answers: input.answers.map(item => ({questionId: item.questionId, isCorrect: false}))};},
  });
  const news = createDemoNews({repository, articles: newsSystem.repository, generator: newsSystem.generator,
    loadConfiguration: newsSystem.configFeature.loadNewsConfiguration, getRewards: async () => ({newsArticleCompletionCoins: 2, newsAllCorrectCoins: 3}),
    getImageSettings: async () => ({...DEFAULT_IMAGE_SETTINGS}), now});
  const service = createDemoService({repository, content, news, now});
  async function start() {
    const secret = token(); await service.startDemo(secret, {}, {sender: randomUUID()});
    await service.saveSetup(secret, {country: "Malaysia", level: "primary", grade: 4}); return secret;
  }
  async function drainPractice(secret, attemptId) {
    for (let i = 0; i < 25; i++) {
      const attempt = (await repository.attemptRef(d.sessionId(secret), attemptId).get()).data();
      if (attempt.status === "queued") await service.runPractice(d.sessionId(secret), attemptId, attempt.requestSequence);
      else return service.getPractice(secret, {attemptId});
    }
    throw Error("Demo practice did not finish");
  }
  async function prepare(secret, overrides = {}) {
    const result = await service.preparePractice(secret, {requestId: randomUUID(), syllabusId: "math", topicId: "fractions", language: "English",
      practiceType: "normal", difficulty: "medium", questionCount: 3, ...overrides});
    return drainPractice(secret, result.practice.attemptId);
  }
  async function complete(secret, overrides = {}, incorrect = false) {
    const prepared = await prepare(secret, overrides), p = prepared.practice;
    const input = p.practiceType === "normal" ? {answers: p.questions.map((q, index) => ({questionId: q.id, selectedOption: incorrect && index === 0 ? "b" : "a"}))}
      : p.practiceType === "essay" ? {essayText: "I found treasure today."} : {answers: {q1: "walks", q2: "reading"}};
    return service.submitPractice(secret, {attemptId: p.attemptId, ...input});
  }
  async function drainNews() {
    const jobs = await db.collection("newsGenerations").where("status", "==", "queued").get();
    for (const job of jobs.docs) await newsSystem.drain(job.id);
  }
  return {...newsSystem, repository, newsRepository: newsSystem.repository, service, content, state, fixtures,
    start, prepare, complete, drainPractice, drainNews, bankQuestion};
}
module.exports = {createDemoTestSystem, token};
