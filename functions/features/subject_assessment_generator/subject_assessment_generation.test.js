const {test} = require("node:test"), assert = require("node:assert/strict");
const {GenerateSubjectAssessment: BackendGenerator} = require("./application/generate_subject_assessment");
const domain = require("../subject_assessment/domain/subject_assessment");

const scope = {studentId: "student", syllabusId: "english", language: "English"};
const configuration = {...scope, version: 1, topics: [{topicId: "numbers", questionType: "normal", totalCount: 2, difficultyCounts: {easy: 2, medium: 0, hard: 0}}]};
const content = key => ({id: key, syllabusId: "english", topicId: "numbers", language: "English", difficulty: "easy", hasDiagram: false,
  questionText: "Number task " + key, options: {a: "1", b: "2", c: "3", d: "4"}, correctAnswer: "b", explanation: "Two"});

test("backend/browser schemas and source identity agree", async () => {
  const web = await import("../../../public/features/subject_assessment/domain/subject_assessment.js");
  for (const name of ["subject_assessment", "subject_assessment_generation", "subject_assessment_usage"]) {
    const backendSchema = require(`../../schema/${name}_schema`);
    const webSchema = await import(`../../../public/config/firebase/${name}_schema.js`);
    for (const key of Object.keys(backendSchema)) assert.deepEqual(webSchema[key], backendSchema[key]);
  }
  assert.equal(await domain.sourceKey(domain.identity("normal", content("same"))), await web.sourceKey(web.identity("normal", content("same"))));
  assert.notEqual(domain.identity("normal", content("same")), domain.identity("normal", {...content("same"), topicId: "another-topic"}));
  const item = await domain.makeItem({position: 1, topicId: "numbers", questionType: "normal", difficulty: "easy"}, content("one"), "reused", "Numbers");
  assert.equal(domain.publicItem(item).marking, undefined);
  assert.equal(domain.publicItem(item).contentSnapshot.correctAnswer, undefined);
  assert.equal(item.marking.correctAnswer, "b");
});

test("both engines preview without invoking persistence and avoid repeats within the same assessment", async t => {
  const {GenerateSubjectAssessment: WebGenerator} = await import("../../../public/features/subject_assessment_generator/application/generate_subject_assessment.js");
  for (const [name, Generator] of [["backend", BackendGenerator], ["browser", WebGenerator]]) await t.test(name, async () => {
    let generated = 0;
    const persistence = new Proxy({}, {get() {assert.fail("Preview must never access persistence");}});
    const available = content("available");
    const engine = new Generator({jobs: persistence, assessments: persistence,
      authorize: async () => ({uid: "admin", assertAccess() {}}),
      loadContext: async () => ({configuration, topics: [{topicId: "numbers", topicName: "Numbers", questionType: "normal"}], syllabus: {}}),
      history: {load: async () => new Set()}, random: () => 0,
      createPool: async () => ({list: async () => [{identity: domain.identity("normal", available), content: available}], load: async candidate => candidate.content,
        draft: async () => {generated++; return content("new");}, save() {assert.fail("Preview cannot save a question");}})});
    const result = await engine.execute(scope, {previewOnly: true});
    assert.equal(result.reusedCount, 1); assert.equal(result.generatedCount, 1); assert.equal(generated, 1);
    assert.equal(new Set(result.items.map(item => item.sourceKey)).size, 2);
  });
});

test("authorization and history failures never cause generation or persistence", async () => {
  let historyReads = 0;
  const engine = new BackendGenerator({authorize: async () => {throw new Error("Administrator required");},
    history: {load: async () => {historyReads++;}}, createPool: () => assert.fail("No model work")});
  await assert.rejects(engine.execute(scope, {previewOnly: true}), /Administrator/);
  assert.equal(historyReads, 0);
  engine.authorize = async () => ({uid: "admin"});
  engine.loadContext = async () => ({configuration, topics: [{topicId: "numbers", questionType: "normal"}]});
  engine.history.load = async () => {throw new Error("History unavailable");};
  await assert.rejects(engine.execute(scope, {previewOnly: true}), /History unavailable/);
  engine.loadContext = async () => ({configuration, topics: [{topicId: "numbers", topicName: "Numbers", questionType: "essay"}]});
  await assert.rejects(engine.execute(scope, {previewOnly: true}), /format.*changed/);
});

test("Primary 4 essay generation needs only an assigned theme seed, in both runtimes", async t => {
  const {SubjectAssessmentContentPool: Backend} = require("./infrastructure/subject_assessment_content_pool");
  const {SubjectAssessmentContentPool: Web} = await import("../../../public/features/subject_assessment_generator/infrastructure/subject_assessment_content_pool.js");
  const {GetRandomQuestionSeedEntry} = require("../question_seed_generator/application/get_random_question_seed_entry");
  const config = require("../essay_question_generator/domain/essay_question_generator_config").createDefaultConfiguration();
  for (const [name, Pool] of [["backend", Backend], ["browser", Web]]) await t.test(name, async () => {
    let themes = [{value: "Older student theme", associations: {primary: [6]}},
      {value: "A family outing", associations: {primary: [4]}}], modelCalls = 0;
    const seeds = new GetRandomQuestionSeedEntry({getEntries: async vertical => {
      assert.equal(vertical, "theme", "No setting or type seeds are required");
      return themes;
    }}, () => 0);
    const run = {syllabusId: "chinese", language: "Chinese", access: {uid: "admin", assertAccess() {}},
      syllabus: {level: "primary", year: 4, subject: "中文", topics: [{id: "writing", topicName: "写作"}]}};
    const pool = new Pool(run, {
      getDb() {assert.fail("Drafts must not access database writes");},
      getEssayConfiguration: async () => config,
      getRandomQuestionSeedEntry: async input => {
        assert.deepEqual(input, {vertical: "theme", level: "primary", grade: 4});
        return seeds.execute(input);
      },
      generateText: async prompt => {
        modelCalls++;
        assert.match(prompt, /A family outing/);
        return {questionText: "请写一篇关于家庭出游的作文。"};
      },
    });
    const slot = {topicId: "writing", questionType: "essay", difficulty: "medium"};
    for (const previewOnly of [true, false]) {
      const draft = await pool.draft(slot, {contentId: "essay", previewOnly, avoidQuestionTexts: []});
      assert.equal(draft.seedUsed, "A family outing");
      assert.equal(draft.standard, 4);
      assert.equal(draft.language, "Chinese");
    }
    assert.equal(modelCalls, 2);
    themes = [];
    await assert.rejects(pool.draft(slot, {contentId: "missing", previewOnly: true}), /No question seed entries are available for theme at primary grade 4/);
    assert.equal(modelCalls, 2, "Missing theme fails before a model call");
  });
});

test("regular essay reuse respects new topic tags while keeping legacy questions eligible", async () => {
  const {GenerateNextStudentEssayPractice: Backend} = require("../student_essay_practice_generator/application/generate_next_student_essay_practice");
  const {GenerateNextStudentEssayPractice: Web} = await import("../../../public/features/student_essay_practice_generator/application/generate_next_student_essay_practice.js");
  for (const Generator of [Backend, Web]) {
    const criteria = {level: "primary", standard: 3, language: "English", difficulty: "easy"};
    let candidate = {...criteria, questionId: "essay", questionText: "Write about a park", seedUsed: "Park", wordCountRequirement: {minWords: null},
      syllabusId: "another", topicId: "writing"};
    const generator = new Generator({listEssayQuestions: async () => ({questions: [candidate], nextCursor: null})});
    const reuse = () => generator.reusableQuestion(criteria, {questionIds: new Set()}, new Map([["park", "Park"]]), () => {},
      {pictureEnabled: false, helpingWordsEnabled: false, helpingWordCount: 5}, {syllabusId: "english", topicId: "writing"});
    assert.equal(await reuse(), null, "A topic-specific question cannot be reused for another subject");
    candidate = {...candidate, syllabusId: "english", topicName: "Writing / planning"};
    assert.equal((await reuse()).topicName, "Writing / planning", "Topic labels remain text, not document IDs");
    delete candidate.syllabusId; delete candidate.topicId; delete candidate.topicName;
    assert.equal((await reuse()).questionId, "essay", "Legacy regular practice is preserved");
  }
});

test("upgrading essay support preserves the verified source topic", async () => {
  const {prepareEssayQuestion} = require("../essay_question_generator/application/prepare_essay_question");
  const config = require("../essay_question_generator/domain/essay_question_generator_config").createDefaultConfiguration();
  config.gradeSupport.primary[3].pictureEnabled = true;
  const source = {questionId: "source", level: "primary", standard: 3, language: "English", difficulty: "easy",
    syllabusId: "english", topicId: "writing", topicName: "Writing", seedUsed: "Park"};
  const support = {version: 1, settings: config.gradeSupport.primary[3], pictureStatus: "failed", picture: null, helpingWordsStatus: "disabled", helpingWords: []};
  let criteria;
  const own = {...source, questionId: "own", support};
  const result = await prepareEssayQuestion({questionId: "source"}, {updatedBy: "admin"}, {getDb() {assert.fail("Compatible reuse needs no writes");}, api: {
    getEssayQuestionById: async () => source, getEssayQuestionGeneratorConfig: async () => config,
    listEssayQuestions: async input => {criteria = input; return {questions: [{...own, questionId: "other", topicId: "another"}, own], nextCursor: null};},
  }});
  assert.equal(result.questionId, "own"); assert.equal(criteria.syllabusId, "english"); assert.equal(criteria.topicId, "writing");
});
