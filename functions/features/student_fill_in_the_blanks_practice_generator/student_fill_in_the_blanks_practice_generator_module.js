const {randomUUID, randomInt, createHash} = require("node:crypto");
const {getFirestoreDb} = require("../../utils/firebase/firebase_ops");
const {guardResetTransaction, guardStudentMaintenance, withTopicResetGuard, hasResetGuard} = require("../../utils/student_topic_reset_guard");
const core = require("../fill_in_the_blanks_question_generator/domain/fill_in_the_blanks");
const {PRE_ASSESSMENT, placementSnapshot} = require("../fill_in_the_blanks_practice/domain/pre_assessment");
function createStudentFillInTheBlanksPracticeGenerator({getDb = getFirestoreDb, now = () => Date.now(), choose = count => randomInt(count),
  students = require("../student_fill_in_the_blanks_practice/student_fill_in_the_blanks_practice_module"),
  questions = require("../fill_in_the_blanks_question_generator/fill_in_the_blanks_question_generator_module"),
  practices = require("../fill_in_the_blanks_practice/fill_in_the_blanks_practice_module"),
  syllabus = require("../syllabus/syllabus_module"), framework = require("../assessment_framework/assessment_framework_module"),
  progress = () => require("../student_assessment_progress/student_assessment_progress_module")} = {}) {
  const trusted = {trusted: true, updatedBy: "system:fill-in-the-blanks-generator"};
  const ref = (studentId, sourceId, initial) => getDb().collection("studentFillInTheBlanksPracticeGenerations").doc(core.id(studentId))
    .collection(initial ? "initials" : "completions").doc(core.id(sourceId));
  async function update(reference, token, fields) {
    await getDb().runTransaction(async tx => {
      await guardResetTransaction(tx, getDb());
      const snapshot = await tx.get(reference);
      if (snapshot.data()?.leaseToken !== token || snapshot.data()?.status !== "generating") throw core.problem("This generation attempt has been replaced.", "generation-lease-lost");
      tx.update(reference, {...fields, updatedAt: new Date(now())});
    });
  }
  async function run({studentId, sourceId, source, initial = false}) {
    const reference = ref(studentId, sourceId, initial), token = randomUUID();
    let state = await getDb().runTransaction(async tx => {
      await guardResetTransaction(tx, getDb());
      await guardStudentMaintenance(tx, getDb().collection("studentPracticeResets").doc(studentId));
      const snapshot = await tx.get(reference), existing = snapshot.data(), until = existing?.leaseUntil?.toDate?.() ?? existing?.leaseUntil;
      if (existing?.status === "completed") return existing;
      if (existing?.status === "generating" && until?.getTime() > now()) throw core.problem("The next practice is already being prepared.", "generation-in-progress");
      const data = {syllabusId: source.syllabusId, topicId: source.topicId, status: "generating",
        nextPracticeId: existing?.nextPracticeId ?? (initial && source.type === PRE_ASSESSMENT ? source.id : randomUUID()), passageId: existing?.passageId ?? null,
        passageSource: existing?.passageSource ?? null, draftId: existing?.draftId ?? null,
        startedAt: existing?.startedAt ?? new Date(now()), updatedAt: new Date(now()), completedAt: null,
        leaseToken: token, leaseUntil: new Date(now() + 10 * 60 * 1000), errorCode: null, errorMessage: null};
      tx.set(reference, data); return data;
    });
    if (state.status === "completed") return state;
    try {
      const existing = await students.getAssignedFillInTheBlanksPractice({studentId, practiceId: state.nextPracticeId})
        ?? await students.getCompletedFillInTheBlanksPractice({studentId, practiceId: state.nextPracticeId});
      if (existing) {
        await update(reference, token, {status: "completed", passageId: existing.passageId, outcome: "assigned", completedAt: new Date(now()), leaseToken: null, leaseUntil: null});
        return {status: "completed", nextPracticeId: state.nextPracticeId, passageId: existing.passageId};
      }
      const definition = await syllabus.getSyllabusById(source.syllabusId);
      const scope = core.scope(source), frameworkId = syllabus.resolveTopicAssessmentFrameworkId(definition, scope);
      if (!frameworkId) throw core.problem("A topic assessment framework is required.", "failed-precondition");
      const preAssessment = initial && source.type === PRE_ASSESSMENT;
      if (preAssessment && source.assessmentFrameworkId !== frameworkId) throw core.problem("The attached pre-assessment belongs to a different framework. Regenerate it for this topic.", "failed-precondition");
      const selectedFramework = preAssessment ? placementSnapshot(source.preAssessmentConfig, frameworkId) : await framework.getAssessmentFrameworkById(frameworkId);
      if (selectedFramework?.frameworkType !== core.TYPE) throw core.problem("The topic needs a fill-in-the-blanks framework.", "failed-precondition");
      const levelId = initial ? null : await progress().getStudentTopicLevel({studentId, ...scope});
      if (!initial && !levelId && selectedFramework.preAssessment) throw core.problem("Complete pre-assessment placement before regular practice.", "failed-precondition");
      if (levelId === "endLevel") {
        const outcome = {status: "completed", nextPracticeId: null, outcome: "framework-completed", completedAt: new Date(now()), leaseToken: null, leaseUntil: null};
        await update(reference, token, outcome); return outcome;
      }
      const level = levelId ? selectedFramework.levels.find(item => item.id === levelId) : selectedFramework.levels[0];
      if (!level) throw core.problem("The student's current level is not available in the topic framework. Check the framework configuration before preparing more practice.", "failed-precondition");
      const criteria = core.generationCriteria({...scope, level: definition.level.toLowerCase(), grade: definition.year,
        difficulty: preAssessment ? selectedFramework.preAssessment.difficultyLevel : level.criteria.difficultyLevel.toLowerCase()});
      const configuration = await questions.getFillInTheBlanksQuestionGeneratorConfig(), settings = configuration.gradeSettings[criteria.level][criteria.grade];
      const candidates = await questions.listFillInTheBlanksQuestions(criteria);
      const used = new Set(await students.listUsedFillInTheBlanksPassageIds({studentId, ...scope}));
      const compatible = passage => passage.level === criteria.level && passage.grade === criteria.grade && passage.difficulty === criteria.difficulty && passage.questionCount === settings.questionsPerPassage
        && passage.settings?.imageEnabled === settings.imageEnabled && !used.has(passage.passageId);
      for (let attempt = 0; attempt < 10; attempt++) {
        const preferred = state.passageId ?? (preAssessment ? source.passageId : null);
        let passage = preferred ? await questions.getFillInTheBlanksQuestionById(preferred) : null;
        if (passage && !compatible(passage)) passage = null;
        if (!passage) {
          const eligible = candidates.filter(compatible);
          if (eligible.length) {
            passage = eligible[choose(eligible.length)];
            state = {...state, passageId: passage.passageId, passageSource: "reused", draftId: null};
          } else {
            const draftId = state.draftId ?? randomUUID();
            await update(reference, token, {draftId});
            passage = await questions.generateFillInTheBlanksQuestion({...criteria, passageId: draftId}, trusted);
            state = {...state, draftId, passageId: passage.passageId, passageSource: "generated"};
          }
          await update(reference, token, {passageId: state.passageId, passageSource: state.passageSource, draftId: state.draftId});
        }
        if (!compatible(passage)) {
          // Keep already-generated content reusable, but do not assign an old draft
          // after settings changed. A retry can select the current configuration.
          await update(reference, token, {nextPracticeId: randomUUID(), passageId: null, passageSource: null, draftId: null});
          throw core.problem("Generation settings changed. Retry preparation with the current grade settings.", "configuration-changed");
        }
        if (state.passageId !== passage.passageId) {
          state = {...state, passageId: passage.passageId, passageSource: "reused"};
          await update(reference, token, {passageId: passage.passageId, passageSource: "reused"});
        }
        const reserved = await practices.getFillInTheBlanksPracticeById(state.nextPracticeId);
        if (reserved && reserved.passageId !== passage.passageId) {
          state = {...state, nextPracticeId: randomUUID()};
          await update(reference, token, {nextPracticeId: state.nextPracticeId});
        }
        await practices.createFillInTheBlanksPractice({passageId: passage.passageId, practiceId: state.nextPracticeId,
          ...(preAssessment ? {type: PRE_ASSESSMENT, assessmentFrameworkId: frameworkId, preAssessmentConfig: selectedFramework} : {})});
        try {
          await students.assignFillInTheBlanksPracticeToStudent({studentId, practiceId: state.nextPracticeId}, {
            ...(initial ? {} : {sourceCompletion: sourceId}), generation: {path: reference.path, leaseToken: token},
          });
        } catch (error) {
          if (error.code !== "passage-already-used") throw error;
          used.add(passage.passageId);
          // A conflicting practice definition is immutable. Reserve a fresh definition ID.
          state = {...state, nextPracticeId: randomUUID(), passageId: null, passageSource: null, draftId: null};
          await update(reference, token, {nextPracticeId: state.nextPracticeId, passageId: null, passageSource: null, draftId: null});
          continue;
        }
        await update(reference, token, {status: "completed", outcome: "assigned", completedAt: new Date(now()), leaseToken: null, leaseUntil: null});
        return {status: "completed", nextPracticeId: state.nextPracticeId, passageId: passage.passageId};
      }
      throw core.problem("Assignments changed while selecting a passage. Retry generation.", "aborted");
    } catch (error) {
      await update(reference, token, {status: "failed", leaseToken: null, leaseUntil: null,
        errorCode: error.code ?? "generation-failed", errorMessage: "The next practice could not be prepared. Please retry."}).catch(() => {});
      throw error;
    }
  }
  return {
    async getFillInTheBlanksGenerationStatus(input) {
      const snapshot = await ref(input.studentId, input.completedPracticeId, false).get();
      if (!snapshot.exists) return null;
      const {leaseToken, ...publicStatus} = snapshot.data(); return publicStatus;
    },
    async generateNextStudentFillInTheBlanksPractice(input) {
      const studentId = core.id(input.studentId), sourceId = core.id(input.completedPracticeId);
      const source = await students.getCompletedFillInTheBlanksPractice({studentId, practiceId: sourceId});
      if (!source) throw core.problem("The source completion could not be found.", "not-found");
      const operation = () => run({studentId, sourceId, source});
      return hasResetGuard() ? operation() : withTopicResetGuard({studentId, createdAt: source.completedAt,
        scopes: [{syllabusId: source.syllabusId, topicId: source.topicId}]}, operation, {getFirestoreDb: getDb});
    },
    async assignInitialStudentFillInTheBlanksPractice(input) {
      const studentId = core.id(input.studentId), template = await practices.getFillInTheBlanksPracticeById(core.id(input.practiceId));
      if (!template || template.syllabusId !== input.syllabusId || template.topicId !== input.topicId) throw core.problem("The initial practice does not match its syllabus topic.");
      if (template.type === PRE_ASSESSMENT && await progress().getStudentTopicLevel({studentId, syllabusId: template.syllabusId, topicId: template.topicId})) {
        return {status: "completed", outcome: "placement-already-applied", nextPracticeId: null};
      }
      const sourceId = "initial-" + createHash("sha256").update(JSON.stringify([template.syllabusId, template.topicId, template.id])).digest("hex");
      const operation = () => run({studentId, sourceId, source: template, initial: true});
      return hasResetGuard() ? operation() : withTopicResetGuard({studentId, scopes: [{syllabusId: template.syllabusId, topicId: template.topicId}]}, operation, {getFirestoreDb: getDb});
    },
  };
}
module.exports = {...createStudentFillInTheBlanksPracticeGenerator(), createStudentFillInTheBlanksPracticeGenerator};
