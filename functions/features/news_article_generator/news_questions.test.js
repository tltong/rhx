const assert = require("node:assert/strict"), test = require("node:test");
const domain = require("../news_article/domain/news_questions");
const {createDefaultNewsConfiguration, normalizeNewsConfiguration, resolveNewsGradeSettings} = require("../student_news/domain/news_config");
const {editionKeys} = require("../news_article/domain/news_article");
const {generateNewsQuestions, translateNewsQuestions} = require("./news_questions_module");
const {LlmUtil, registerLlmProvider} = require("../../utils/llm/llm_util");
const edition = {editionId: "edition", storyId: "story", baseKey: "base", gradeKey: "primary_6", language: "English", title: "Science news",
  pages: [{position: 1, text: "A science exhibition opened on Monday. Students learn about space.", imageIndices: [], altTexts: []}], imagePlans: []};
const fixture = () => ({questions: [["The event is a ____.", "science exhibition"], ["It opened on ____.", "Monday"], ["Students learn about ____.", "space"]].map(([prompt, answer]) => ({prompt, answer, evidence: {source: "text", pagePosition: 1, quote: edition.pages[0].text}})), distractors: ["ocean", "Friday"]});
test("grade modes have legacy defaults and do not change article or question reuse identity", () => {
  const config = createDefaultNewsConfiguration(), criteria = {level: "primary", standard: 6};
  assert.deepEqual(Object.values(config.gradeSettings.primary).map(value => value.questionAnswerMode), ["word_bank", "word_bank", "word_bank", "word_bank", "typed", "typed"]);
  assert.ok(Object.values(config.gradeSettings.secondary).every(value => value.questionAnswerMode === "typed"));
  const before = editionKeys({storyId: "story", revision: 1}, resolveNewsGradeSettings(config, criteria), "English");
  config.gradeSettings.primary[6].questionAnswerMode = "word_bank";
  assert.deepEqual(editionKeys({storyId: "story", revision: 1}, resolveNewsGradeSettings(config, criteria), "English"), before);
  delete config.gradeSettings.primary[6].questionAnswerMode; assert.equal(normalizeNewsConfiguration(config).gradeSettings.primary[6].questionAnswerMode, "typed");
  for (const value of [null, 1, "multiple_choice"]) {config.gradeSettings.primary[6].questionAnswerMode = value; assert.throws(() => normalizeNewsConfiguration(config));}
  assert.equal(domain.setId(edition), domain.setId({...edition, language: "French"}));
});
test("questions require three single blanks, five distinct choices and article-grounded evidence", () => {
  const selected = domain.normalizeQuestionSet(fixture(), edition);
  assert.equal(selected.questions.length, 3); assert.equal(selected.choices.length, 5);
  assert.ok(selected.choices.every(choice => /^choice_[a-f0-9]{32}$/.test(choice.id)));
  const cases = [raw => raw.questions.pop(), raw => raw.distractors.pop(), raw => raw.questions[0].prompt = "Two ____ blanks ____", raw => raw.questions[0].prompt = "No blank", raw => raw.questions[0].evidence.quote = "Unsupported fact", raw => raw.distractors[0] = "MONDAY", raw => raw.questions[0].acceptedAnswers = ["Friday"]];
  for (const mutate of cases) {const raw = fixture(); mutate(raw); assert.throws(() => domain.normalizeQuestionSet(raw, edition));}
});
test("picture-only questions need valid visible-image evidence", () => {
  const picture = {...edition, pages: [{position: 1, text: "", imageIndices: [0], altTexts: ["A blue rocket."]}], imagePlans: [{description: "A blue rocket."}]}, raw = fixture();
  raw.questions.forEach(question => {question.evidence = {source: "image", imageIndex: 0, pagePosition: 1, quote: "rocket"};});
  assert.equal(domain.normalizeQuestionSet(raw, picture).questions.length, 3);
  raw.questions[0].evidence.imageIndex = 1; assert.throws(() => domain.normalizeQuestionSet(raw, picture), /not found/);
});
test("translated questions retain identities, correct-choice links and bank order", () => {
  const selected = domain.normalizeQuestionSet(fixture(), edition), raw = {questions: selected.questions.map(question => ({...question, prompt: "French " + question.prompt, acceptedAnswers: []})), choices: selected.choices.map(choice => ({...choice, text: "French " + choice.text}))};
  const translated = domain.normalizeQuestionLanguage(raw, selected, {...edition, language: "French"});
  assert.deepEqual(translated.questions.map(q => [q.id, q.answerChoiceId]), selected.questions.map(q => [q.id, q.answerChoiceId]));
  assert.deepEqual(translated.choices.map(choice => choice.id), selected.choices.map(choice => choice.id));
  raw.questions[0].id = "replacement"; assert.throws(() => domain.normalizeQuestionLanguage(raw, selected, edition));
});
test("marking accepts stored alternatives, case and whitespace without fuzzy matching", () => {
  const raw = fixture(); raw.questions[0].acceptedAnswers = ["science fair"];
  const selected = domain.normalizeQuestionSet(raw, edition), answers = [" SCIENCE   FAIR ", "monday", "spaces"].map((value, index) => ({questionId: "q" + (index + 1), value}));
  assert.deepEqual(domain.markAnswers(answers, selected, "typed").map(item => item.correct), [true, true, false]);
  assert.throws(() => domain.markAnswers(answers.slice(0, 2), selected, "typed"));
  assert.throws(() => domain.markAnswers(answers.map(item => ({...item, correct: true})), selected, "typed"));
  assert.throws(() => domain.markAnswers(answers, selected, "word_bank"), /word bank/);
  assert.ok(domain.markAnswers(selected.questions.map(question => ({questionId: question.id, value: question.answerChoiceId})), selected, "word_bank").every(item => item.correct));
});
test("public questions redact keys until submission and localize completed bank responses", () => {
  const selected = domain.normalizeQuestionSet(fixture(), edition), publicTyped = domain.publicQuestions(selected, "typed", null);
  assert.deepEqual(publicTyped.wordBank, []); assert.equal(publicTyped.attempt, null);
  assert.doesNotMatch(JSON.stringify(publicTyped), /answerChoiceId|acceptedAnswers|evidence|Monday|space/);
  const responses = domain.markAnswers(selected.questions.map(question => ({questionId: question.id, value: question.answerChoiceId})), selected, "word_bank");
  const review = domain.publicQuestions(selected, "word_bank", {status: "submitted", score: 3, language: "English", responses}).attempt;
  assert.equal(review.score, 3); assert.ok(review.review.every(item => item.correct && item.correctAnswer === item.response));
});
test("question generation and translation route through utils/llm to DeepSeek", async () => {
  const original = new LlmUtil().getProviderAdapter("deepseek"), calls = [];
  registerLlmProvider("deepseek", {call() {}, generateText: async (input, options) => {calls.push({input, options}); return {};}});
  try {
    await generateNewsQuestions(edition); await translateNewsQuestions(domain.normalizeQuestionSet(fixture(), edition), {...edition, language: "French"});
    assert.equal(calls.length, 2); assert.match(calls[0].input, /understanding of the article/); assert.match(calls[1].input, /SAME three/);
    assert.ok(calls.every(call => call.options.timeoutMs === 120000));
  } finally {registerLlmProvider("deepseek", original);}
});
