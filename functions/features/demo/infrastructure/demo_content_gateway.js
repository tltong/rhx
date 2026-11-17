const d = require("../domain/demo");
const {randomInt} = require("node:crypto");
const {DEFAULT_REWARD_CONFIG} = require("../../../schema/reward_schema");
const {markPassage} = require("../../fill_in_the_blanks_scoring/application/mark_passage");
const {requireTutorGuideForQuestion} = require("../../tutor/domain/tutor_guide_version");
const {FirestoreTutorMiniQuestionSetRepository} = require("../../tutor/infrastructure/firestore_tutor_mini_question_set_repository");

function createDemoContentGateway({
  syllabuses = require("../../syllabus/syllabus_module"),
  scopes = require("../../syllabusscope/syllabusscope_module"),
  frameworks = require("../../assessment_framework/assessment_framework_module"),
  questions = require("../../question/question_module"),
  generators = require("../../question_generator/question_generator_module"),
  promptConfigs = require("../../llm_prompt_config/llm_prompt_config_module"),
  essays = require("../../essay_question_generator/essay_question_generator_module"),
  essayPractices = require("../../essay_practice/essay_practice_module"),
  essayScoring = require("../../essay_scoring/essay_scoring_module"),
  passages = require("../../fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module"),
  fillPractices = require("../../fill_in_the_blanks_practice/fill_in_the_blanks_practice_module"),
  fillScoring = require("../../fill_in_the_blanks_scoring/fill_in_the_blanks_scoring_module"),
  tutor = require("../../tutor/tutor_module"),
  tutorSets = new FirestoreTutorMiniQuestionSetRepository(),
  rewards = require("../../reward/reward_module"),
  generateText = (...args) => require("../../../utils/llm/llm_ops").generateLlmText(...args),
} = {}) {
  async function catalog() {
    const countries = (await scopes.listSyllabusScopes()).map(scope => ({
      country: scope.country, levels: Object.entries(scope.levels || {}).map(([level, grades]) => ({
        level, grades: Object.entries(grades || {}).filter(([, enabled]) => enabled === true)
          .map(([grade]) => Number(grade)).filter(grade => Number.isInteger(grade) && grade > 0).sort((a, b) => a - b),
      })).filter(level => level.grades.length),
    })).filter(country => country.levels.length).sort((a, b) => a.country.localeCompare(b.country));
    return {countries, maxMcqQuestions: d.MAX_MCQ_QUESTIONS};
  }
  async function validateScope(input) {
    const countries = (await catalog()).countries;
    const country = countries.find(item => d.key(item.country) === d.key(input.country));
    const level = country?.levels.find(item => d.key(item.level) === d.key(input.level));
    if (!level || !level.grades.includes(input.grade)) throw d.fail("Choose an available country, level and grade.");
    return {country: country.country, level: level.level, grade: input.grade};
  }
  async function subjects(scope) {
    const items = (await syllabuses.listSyllabuses()).filter(item => d.scopeMatches(item, scope));
    const cache = new Map();
    function framework(id) {
      if (!cache.has(id)) cache.set(id, frameworks.getAssessmentFrameworkById(id));
      return cache.get(id);
    }
    return {subjects: await Promise.all(items.map(async syllabus => {
      const topics = await Promise.all(syllabus.topics.map(async topic => {
        const configurations = [];
        for (const language of syllabus.languages) {
          const id = syllabuses.resolveTopicAssessmentFrameworkId(syllabus, {topicId: topic.id, language});
          const selected = id ? await framework(id) : null;
          if (selected && ["normal", "essay", "fillInTheBlanks"].includes(selected.frameworkType)) {
            configurations.push({language, practiceType: selected.frameworkType});
          }
        }
        return {id: topic.id, name: topic.topicName, configurations};
      }));
      return {id: syllabus.id, name: syllabus.subject, topics: topics.filter(topic => topic.configurations.length),
        languages: syllabus.languages.filter(language => topics.some(topic => topic.configurations.some(config => config.language === language)))};
    }))};
  }
  async function context(scope, input) {
    const syllabus = await syllabuses.getSyllabusById(d.id(input.syllabusId));
    if (!d.scopeMatches(syllabus, scope)) throw d.fail("Choose a subject available for your demo.", "permission-denied");
    const topic = syllabus.topics.find(item => item.id === d.id(input.topicId));
    const language = syllabus.languages.find(item => d.key(item) === d.key(input.language));
    if (!topic || !language) throw d.fail("Choose a topic and language belonging to this subject.");
    const frameworkId = syllabuses.resolveTopicAssessmentFrameworkId(syllabus, {topicId: topic.id, language});
    const framework = frameworkId ? await frameworks.getAssessmentFrameworkById(frameworkId) : null;
    if (!framework || framework.frameworkType !== input.practiceType) throw d.fail("This practice type is not configured for the topic and language.", "failed-precondition");
    const first = [...framework.levels].sort((a, b) => a.sequenceOrder - b.sequenceOrder)[0];
    const configuredDifficulty = d.key(input.practiceType === "fillInTheBlanks" ? framework.preAssessment?.difficultyLevel || "medium"
      : first?.criteria?.difficultyLevel || "medium");
    const choices = framework.frameworkType === "normal" ? d.mcqChoices(input)
      : {difficulty: framework.frameworkType === "fillInTheBlanks"
        ? d.difficulty(input.difficulty === undefined ? configuredDifficulty : input.difficulty) : configuredDifficulty, questionCount: 1};
    return {syllabusId: syllabus.id, topicId: topic.id, subject: syllabus.subject, topic: topic.topicName, language,
      practiceType: framework.frameworkType, frameworkId, level: d.key(syllabus.level), grade: Number(syllabus.year),
      tutorEnabled: topic.tutorEnabled !== false,
      ...choices};
  }
  async function coinReward() {
    return (await rewards.getRewardConfig())?.bonusMissionCompletionCoins ?? DEFAULT_REWARD_CONFIG.bonusMissionCompletionCoins;
  }
  async function pool(attempt) {
    const groups = await Promise.all([false, true].map(hasDiagram => questions.listQuestionsByTopic(attempt.syllabusId, attempt.topicId,
      {language: attempt.language, hasDiagram, difficulty: attempt.difficulty, group: "assessment", limit: d.MAX_MCQ_QUESTIONS})));
    const candidates = [...new Map(groups.flat().filter(q => d.key(q.difficulty) === attempt.difficulty && d.key(q.language) === d.key(attempt.language))
      .map(q => [[q.id, q.hasDiagram].join(":"), d.plain(q)])).values()];
    for (let index = candidates.length - 1; index > 0; index--) {
      const selected = randomInt(index + 1); [candidates[index], candidates[selected]] = [candidates[selected], candidates[index]];
    }
    return candidates.slice(0, attempt.questionCount);
  }
  async function prepare(attempt, repository) {
    // Recheck current topic availability before starting paid work.
    const source = await syllabuses.getSyllabusById(attempt.syllabusId);
    if (!d.scopeMatches(source, attempt.sessionScope)) throw d.fail("This subject is no longer available.", "failed-precondition");
    const selectedTopic = source.topics.find(item => item.id === attempt.topicId);
    if (!selectedTopic || syllabuses.resolveTopicAssessmentFrameworkId(source, attempt) !== attempt.frameworkId) {
      throw d.fail("The topic configuration changed. Choose the practice again.", "failed-precondition");
    }
    if (attempt.practiceType === "normal") {
      const assemble = async () => {
        let selected = await pool(attempt);
        if (selected.length < attempt.questionCount) {
          const config = await promptConfigs.getDefaultLlmPromptConfig();
          if (!config?.id) throw d.fail("Question generation is not configured yet.", "failed-precondition");
          await generators.generateQuestions(config.id, attempt.syllabusId, {
            topicId: attempt.topicId, language: attempt.language, difficultyLevel: attempt.difficulty,
            numberOfQuestions: Math.min(5, attempt.questionCount - selected.length), group: "assessment",
            avoidQuestionTexts: selected.map(question => question.questionText),
          });
          selected = await pool(attempt);
        }
        if (selected.length < attempt.questionCount) return {status: "queued", stage: "questions",
          progress: {prepared: selected.length, total: attempt.questionCount}};
        return {status: "ready", stage: "ready", questions: selected, progress: {prepared: selected.length, total: selected.length}};
      };
      const selected = await pool(attempt);
      if (selected.length === attempt.questionCount) return {status: "ready", stage: "ready", questions: selected};
      return repository.poolLease([attempt.syllabusId, attempt.topicId, d.key(attempt.language), attempt.difficulty], assemble);
    }
    const attached = selectedTopic.getPreAssessmentPractice(attempt.language);
    if (attempt.practiceType === "essay") {
      let question = null;
      if (attached?.practiceType === "essay") {
        const practice = await essayPractices.getEssayPracticeById(attached.practiceId);
        if (practice) question = await essays.getEssayQuestionById(practice.essayQuestionId);
      }
      if (question && await essays.isEssayQuestionRetired(question.questionId)) question = null;
      question ||= await essays.getRandomEssayQuestion({level: attempt.level, standard: attempt.grade, language: attempt.language,
        difficulty: attempt.difficulty, syllabusId: attempt.syllabusId, topicId: attempt.topicId});
      if (!question) throw d.fail("An essay has not been prepared for this topic yet. Choose another topic.", "failed-precondition");
      return {status: "ready", stage: "ready", question: d.plain(question), scoringConfig: d.plain(await essayScoring.getEssayScoringConfig())};
    }
    let passage = null;
    if (attached?.practiceType === "fillInTheBlanks") {
      const practice = await fillPractices.getFillInTheBlanksPracticeById(attached.practiceId);
      if (practice) passage = await passages.getFillInTheBlanksQuestionById(practice.passageId, {includeAnswers: true});
    }
    if (passage && d.key(passage.difficulty) !== attempt.difficulty) passage = null;
    if (!passage) {
      const available = await passages.listFillInTheBlanksQuestions({syllabusId: attempt.syllabusId, topicId: attempt.topicId,
        language: attempt.language, difficulty: attempt.difficulty});
      const candidate = available.find(item => d.key(item.difficulty) === attempt.difficulty);
      if (candidate) passage = await passages.getFillInTheBlanksQuestionById(candidate.passageId, {includeAnswers: true});
    }
    if (!passage || d.key(passage.difficulty) !== attempt.difficulty) {
      throw d.fail("No " + attempt.difficulty + " passage is available for this topic yet. Choose another difficulty or topic.", "failed-precondition");
    }
    return {status: "ready", stage: "ready", passage: d.plain(passage), questionCount: passage.questions.length,
      scoringConfig: d.plain(await fillScoring.getFillInTheBlanksScoringConfig())};
  }
  async function mark(attempt) {
    if (attempt.practiceType === "essay") return essayScoring.scoreEssaySnapshot({
      question: attempt.question, answer: attempt.submission.essayText, configuration: attempt.scoringConfig,
    });
    return markPassage({passage: attempt.passage, answers: attempt.submission.answers,
      markingInstructions: attempt.scoringConfig?.markingInstructions || "", generateText});
  }
  async function tutorSource(attempt, index) {
    if (attempt.practiceType !== "normal" || !attempt.result?.review[index] || attempt.result.review[index].isCorrect) {
      throw d.fail("Tutor review is available for an incorrect MCQ answer.", "permission-denied");
    }
    if (!await syllabuses.isTopicTutorEnabled(attempt.syllabusId, attempt.topicId)) throw d.fail("Tutor is disabled for this topic.", "failed-precondition");
    const question = attempt.questions[index];
    return tutor.createTutorReviewForQuestion(async questionId => {
      if (questionId !== question.id) throw d.fail("Choose a question from this practice.", "permission-denied");
      if (!await syllabuses.isTopicTutorEnabled(attempt.syllabusId, attempt.topicId)) throw d.fail("Tutor is disabled for this topic.", "failed-precondition");
      return question;
    });
  }
  async function getTutor(attempt, index) {
    const api = await tutorSource(attempt, index);
    if (attempt.tutorGuides?.[String(index)]) return attempt.tutorGuides[String(index)];
    return api.getTutorMiniQuestionSet({questionId: attempt.questions[index].id, language: attempt.language});
  }
  async function getTutorAnswer(attempt, index, sequence) {
    await tutorSource(attempt, index);
    const pinned = attempt.tutorGuides?.[String(index)];
    if (!pinned) throw d.fail("Open this question's tutor review first.", "failed-precondition");
    const guideId = await requireTutorGuideForQuestion(pinned.guideId, attempt.questions[index]);
    const set = await tutorSets.get({questionId: guideId, language: attempt.language, miniQuestionCount: pinned.miniQuestionCount}, {allowLegacy: false});
    const mini = set?.miniQuestions.find(question => question.sequence === sequence);
    if (!mini) throw d.fail("This tutor answer is unavailable. Reopen the review or try another practice.", "failed-precondition");
    return mini.expectedAnswer;
  }
  async function checkTutor(attempt, index, input) {
    const api = await tutorSource(attempt, index), pinned = attempt.tutorGuides?.[String(index)];
    if (!pinned) throw d.fail("Open this question's tutor review first.", "failed-precondition");
    const result = await api.checkTutorMiniQuestionAnswer({guideId: pinned.guideId, miniQuestionCount: pinned.miniQuestionCount, questionId: attempt.questions[index].id,
      language: attempt.language, sequence: input.sequence, answer: input.answer});
    const config = await tutor.getTutorConfig();
    return {...result, message: (result.isCorrect ? config?.correctAnswerMessage : config?.incorrectAnswerMessage)?.[attempt.language]
      || (result.isCorrect ? "Correct. Continue to the next step." : "Try again. Look at the question carefully.")};
  }
  async function reviewPolicy(attempt) {
    try {return await syllabuses.isTopicTutorEnabled(attempt.syllabusId, attempt.topicId);}
    catch {return false;}
  }
  return {catalog, validateScope, subjects, context, coinReward, prepare, mark, getTutor, getTutorAnswer, checkTutor, reviewPolicy};
}
module.exports = {createDemoContentGateway};
