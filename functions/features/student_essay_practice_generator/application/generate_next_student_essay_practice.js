const {QUESTION_SELECTION_ATTEMPT_LIMIT} = require("../config/student_essay_practice_generator_config");
const {normalizeGenerationRequest, requireIdentifier, themeKey, questionCriteria, normalizeDraft, generationError} = require("../domain/essay_generation");

class GenerateNextStudentEssayPractice {
  constructor(dependencies) {Object.assign(this, {random: Math.random}, dependencies);}

  async studentHistory(studentId, source, sourceQuestion, assertAccess) {
    const questionIds = new Set([source.essayQuestionId]);
    // Intentionally omit syllabus/topic filters: all this student's essays count.
    await Promise.all([this.listCompletedEssayPractices, this.listAssignedEssayPractices].map(async list => {
      let cursor = null;
      do {
        assertAccess();
        const page = await list({studentId, limit: 100, cursor});
        assertAccess();
        for (const practice of page.practices) questionIds.add(practice.essayQuestionId);
        cursor = page.nextCursor;
      } while (cursor);
    }));
    const themes = new Set([themeKey(sourceQuestion.seedUsed)]);
    const remaining = [...questionIds].filter(id => id !== source.essayQuestionId);
    for (let start = 0; start < remaining.length; start += 25) {
      const questions = await Promise.all(remaining.slice(start, start + 25).map(id => this.getEssayQuestionById(id)));
      assertAccess();
      for (const question of questions) {
        if (!question) throw new Error("An essay question from this student's history could not be found.");
        themes.add(themeKey(question.seedUsed));
      }
    }
    return {questionIds, themes};
  }

  async availableThemes(criteria, history, assertAccess) {
    const entries = await this.getQuestionSeedEntries({vertical: "theme", level: criteria.level, grade: criteria.standard});
    assertAccess();
    const themes = new Map();
    for (const entry of entries) {
      const key = themeKey(entry.value);
      if (!history.themes.has(key)) themes.set(key, entry.value);
    }
    if (themes.size) return {themes, useDefault: false};
    const fallback = await this.getDefaultQuestionSeedTheme();
    assertAccess();
    return {themes: new Map([[themeKey(fallback), fallback]]), useDefault: true};
  }

  async reusableQuestion(criteria, history, themes, assertAccess) {
    let cursor = null, selected = null, count = 0;
    const sample = total => {
      const draw = this.random();
      if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("Invalid random question selection.");
      return draw < 1 / total;
    };
    do {
      assertAccess();
      const page = await this.listEssayQuestions({...criteria, limit: 100, cursor});
      assertAccess();
      for (const question of page.questions) {
        if (history.questionIds.has(question.questionId) || !themes.has(themeKey(question.seedUsed))) continue;
        const candidate = normalizeDraft(question, criteria, question.seedUsed);
        if (sample(++count)) selected = candidate;
      }
      cursor = page.nextCursor;
    } while (cursor);
    return selected;
  }

  async existingPractice(request, generation, source, assertAccess) {
    const reference = {studentId: request.studentId, essayPracticeId: generation.nextEssayPracticeId};
    const practice = await this.getAssignedEssayPractice(reference) || await this.getCompletedEssayPractice(reference);
    assertAccess();
    if (!practice) return null;
    const expectedQuestionId = generation.essayQuestionId ?? generation.reusedQuestionId ?? generation.draft?.questionId;
    if (!expectedQuestionId || practice.essayQuestionId !== expectedQuestionId
        || practice.syllabusId !== source.syllabusId || practice.topicId !== source.topicId) {
      throw new Error("The next essay assignment conflicts with its generation record.");
    }
    return practice;
  }

  async execute(input, context) {
    const request = normalizeGenerationRequest(input);
    const administrator = await this.requireAdministrator(context);
    const updatedBy = requireIdentifier(administrator?.uid, "updatedBy");
    const assertAccess = administrator.assertAccess ?? (() => {});
    assertAccess();
    const source = await this.getCompletedEssayPractice({studentId: request.studentId, essayPracticeId: request.completedEssayPracticeId});
    assertAccess();
    if (!source) throw new Error("The completed essay practice could not be found.");
    const persistenceContext = {assertAccess, sourceCompletion: {completedAt: source.completedAt, syllabusId: source.syllabusId, topicId: source.topicId}};
    let generation = await this.repository.claim(request, persistenceContext);
    try {
      let practice = await this.existingPractice(request, generation, source, assertAccess);
      if (practice) {
        if (generation.status !== "completed") await this.repository.finish(request, generation.leaseToken, practice.essayQuestionId, persistenceContext);
        assertAccess();
        return practice;
      }
      if (generation.status === "completed") throw new Error("The previously generated essay assignment could not be found.");
      const sourceQuestion = await this.getEssayQuestionById(source.essayQuestionId);
      assertAccess();
      if (!sourceQuestion) throw new Error("The completed essay's question could not be found.");
      const criteria = questionCriteria(sourceQuestion);
      const unavailableQuestionIds = new Set();
      for (let selectionAttempt = 0; selectionAttempt < QUESTION_SELECTION_ATTEMPT_LIMIT; selectionAttempt++) {
        const history = await this.studentHistory(request.studentId, source, sourceQuestion, assertAccess);
        for (const id of unavailableQuestionIds) history.questionIds.add(id);
        const selectedId = generation.reusedQuestionId ?? generation.draft?.questionId;
        if (selectedId && history.questionIds.has(selectedId)) {
          generation = await this.repository.clearSelection(request, generation.leaseToken, persistenceContext);
          continue;
        }
        const {themes, useDefault} = await this.availableThemes(criteria, history, assertAccess);
        if (selectedId) {
          const selected = generation.draft ?? await this.getEssayQuestionById(selectedId);
          assertAccess();
          if (!selected) throw new Error("The selected essay question could not be found.");
          if (!themes.has(themeKey(selected.seedUsed))) {
            generation = await this.repository.clearSelection(request, generation.leaseToken, persistenceContext);
            continue;
          }
        }
        let draft = generation.draft, question;
        if (!draft && !generation.reusedQuestionId) {
          const reusable = useDefault ? null : await this.reusableQuestion(criteria, history, themes, assertAccess);
          if (reusable) {
            generation = await this.repository.saveReusedQuestion(request, generation.leaseToken, reusable.questionId, persistenceContext);
          } else {
            const draw = this.random();
            if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("Invalid random theme selection.");
            const seed = [...themes.values()][Math.floor(draw * themes.size)];
            const generated = await this.generateEssayQuestion({...criteria, seed, save: false}, {updatedBy});
            assertAccess();
            draft = normalizeDraft(generated, criteria, seed);
            if (history.questionIds.has(draft.questionId)) throw new Error("The generated essay question ID has already been used by this student.");
            generation = await this.repository.saveDraft(request, generation.leaseToken, draft, persistenceContext);
          }
        }
        if (generation.reusedQuestionId) {
          const stored = await this.getEssayQuestionById(generation.reusedQuestionId);
          assertAccess();
          if (!stored) throw new Error("The selected essay question could not be found.");
          question = normalizeDraft(stored, criteria, stored.seedUsed);
        } else {
          draft = normalizeDraft(generation.draft, criteria, generation.draft.seedUsed);
          question = await this.saveEssayQuestion(draft, {updatedBy});
        }
        assertAccess();
        const assignment = {studentId: request.studentId, essayQuestionId: question.questionId,
          syllabusId: source.syllabusId, topicId: source.topicId, essayPracticeId: generation.nextEssayPracticeId};
        try {
          practice = await this.assignEssayPracticeToStudent(assignment, {preventQuestionReuse: true, sourceCompletion: {
            essayPracticeId: request.completedEssayPracticeId, completedAt: source.completedAt,
          }});
        } catch (error) {
          // A committed assignment may have lost its response or already been completed.
          practice = await this.existingPractice(request, generation, source, assertAccess);
          if (!practice) {
            if (error.code !== "essay-question-already-used") throw error;
            unavailableQuestionIds.add(question.questionId);
            generation = await this.repository.clearSelection(request, generation.leaseToken, persistenceContext);
            continue;
          }
        }
        assertAccess();
        await this.repository.finish(request, generation.leaseToken, practice.essayQuestionId, persistenceContext);
        assertAccess();
        return practice;
      }
      throw generationError("essay-question-selection-conflict", "Essay assignments changed during selection. Retry the request.");
    } catch (error) {
      if (generation.status !== "completed") {
        try {await this.repository.fail(request, generation.leaseToken, persistenceContext);} catch { /* Preserve the original error; an expired owner cannot change another worker's state. */ }
      }
      throw error;
    }
  }
}

module.exports = {GenerateNextStudentEssayPractice};
