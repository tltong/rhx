const {requireConfigurationInput, resolveAllocations} = require("../../subject_assessment_config/domain/subject_assessment_config");
const {scope, sameScope, id, problem, clean, slots, makeItem, summary, validateItems} = require("../../subject_assessment/domain/subject_assessment");

class GenerateSubjectAssessment {
  constructor(dependencies) {Object.assign(this, {uuid: () => globalThis.crypto.randomUUID(), random: Math.random, ...dependencies});}
  async execute(input, {previewOnly = false, onProgress = () => {}} = {}, context) {
    const selected = scope(input), access = await this.authorize(context);
    access.assertAccess?.();
    const requestId = previewOnly ? null : id(input.requestId || this.uuid(), "Request ID");
    const started = Date.now();
    let state = null;
    try {
      // Completed requests remain idempotent even if the configuration changes later.
      const previous = previewOnly ? null : await this.jobs.get(requestId);
      if (previous && !sameScope(previous, selected)) throw problem("This request ID belongs to a different student or subject.", "already-exists");
      if (previous?.status === "completed") return this.assessments.get(previous.assessmentId);
      const loaded = await this.loadContext(selected);
      const configuration = clean(previous?.configurationSnapshot || loaded.configuration);
      if (!configuration) throw problem("Save the subject assessment configuration before generating.", "failed-precondition");
      requireConfigurationInput({...configuration, expectedVersion: configuration.version});
      if (configuration.syllabusId !== selected.syllabusId) throw problem("The saved configuration belongs to a different syllabus.");
      configuration.topics = resolveAllocations(configuration.topics, loaded.topics);
      if (input.expectedConfigurationVersion !== undefined && input.expectedConfigurationVersion !== configuration.version) {
        throw problem("The saved configuration changed. Reload it before generating.", "configuration-changed");
      }
      const run = {...selected, language: configuration.language, configuration, syllabus: loaded.syllabus, access, previewOnly};
      // Read all history before any paid generation or persistence. Failures never imply an empty history.
      const used = await this.history.load(run);
      access.assertAccess?.();
      if (!previewOnly) {
        state = await this.jobs.claim({...run, requestId, generationRequest: input.generationRequest}, configuration, access);
        if (state.status === "completed") return this.assessments.get(state.assessmentId);
        run.configuration = state.configurationSnapshot;
        run.configuration.topics = resolveAllocations(run.configuration.topics, loaded.topics);
        if (state.contextSnapshot?.level && state.contextSnapshot?.grade) run.syllabus = {...run.syllabus, ...state.contextSnapshot, year: state.contextSnapshot.grade};
      }
      const plan = slots(run.configuration), pool = await this.createPool(run), items = [], candidateSets = new Map();
      const progress = () => ({prepared: items.length, total: plan.length,
        reused: items.filter(item => item.source === "reused").length, generated: items.filter(item => item.source === "generated").length});
      onProgress(progress());
      for (const slot of plan) {
        access.assertAccess?.();
        let checkpoint = previewOnly ? null : await this.jobs.checkpoint(state, slot.position);
        if (checkpoint?.item && (["topicId", "questionType", "difficulty", "position"].some(key => checkpoint.item[key] !== slot[key]) || used.has(checkpoint.item.identity))) checkpoint = null;
        const selectedSlot = pool.selectSlot ? await pool.selectSlot(slot, checkpoint?.item, {pooled: checkpoint?.pooled}) : slot;
        if (selectedSlot.invalidateCheckpoint) checkpoint = null;
        if (checkpoint?.item && selectedSlot.essayTypeId && checkpoint.item.contentSnapshot.essayTypeId !== selectedSlot.essayTypeId) checkpoint = null;
        const alreadyPrepared = !!checkpoint?.item && checkpoint.pooled;
        if (!checkpoint?.item) {
          const bucket = JSON.stringify([slot.topicId, slot.questionType, slot.difficulty, selectedSlot.essayTypeId]);
          if (!candidateSets.has(bucket)) candidateSets.set(bucket, await pool.list(selectedSlot));
          const candidates = candidateSets.get(bucket).filter(candidate => !used.has(candidate.identity));
          let content, source, draft = null;
          if (candidates.length) {
            const draw = this.random();
            if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw problem("Invalid random selection.");
            content = await pool.load(candidates[Math.floor(draw * candidates.length)]); source = "reused";
          } else {
            const contentId = checkpoint?.contentId || this.uuid();
            if (!previewOnly) await this.jobs.saveCheckpoint(state, slot.position, {contentId, item: null, draft: null, pooled: false}, progress(), access);
            content = await pool.draft(selectedSlot, {contentId, previewOnly,
              avoidQuestionTexts: [...candidateSets.get(bucket).map(candidate => candidate.content?.questionText), ...items.map(item => item.contentSnapshot.questionText)].filter(Boolean)});
            source = "generated"; draft = content;
          }
          const topicName = loaded.topics.find(topic => topic.topicId === slot.topicId)?.topicName || slot.topicId;
          const item = await makeItem(slot, content, source, topicName);
          if (selectedSlot.essayTypeId) item.essayTypeSelection = {questionId: content.questionId, seedUsed: content.seedUsed, essayTypeId: selectedSlot.essayTypeId,
            eligibleTypeIds: selectedSlot.eligibleTypeIds, usedTypeIds: selectedSlot.usedTypeIds};
          if (used.has(item.identity)) throw problem("The selected content has already been used. Retry generation.", "content-already-used");
          checkpoint = {item, draft, pooled: source === "reused"};
          if (!previewOnly) await this.jobs.saveCheckpoint(state, slot.position, checkpoint, progress(), access);
        }
        if (!previewOnly && !checkpoint.pooled) {
          await pool.save(slot.questionType, checkpoint.draft);
          checkpoint = {...checkpoint, pooled: true};
          await this.jobs.saveCheckpoint(state, slot.position, checkpoint, progress(), access);
        }
        items.push(checkpoint.item); used.add(checkpoint.item.identity);
        if (pool.recordSelection) await pool.recordSelection(checkpoint.item);
        if (!previewOnly) await this.jobs.saveCheckpoint(state, slot.position, checkpoint, progress(), access);
        onProgress(progress()); access.assertAccess?.();
        if (!previewOnly && !alreadyPrepared && items.length < plan.length && Date.now() - started > (this.maxRunMs ?? Infinity)) return this.jobs.pause(state, access);
      }
      validateItems(run.configuration, items);
      if (previewOnly) return clean({previewOnly: true, ...selected, language: run.language, configurationVersion: run.configuration.version,
        configurationSnapshot: run.configuration, items, ...summary(items)});
      const refreshed = await this.history.load(run);
      if (items.some(item => refreshed.has(item.identity))) throw problem("Selected content was assigned while the assessment was being prepared. Retry this request.", "content-already-used");
      access.assertAccess?.();
      await this.jobs.publish(state, items, access);
      return this.assessments.get(state.assessmentId);
    } catch (error) {
      if (state?.leaseToken) await this.jobs.fail(state, error).catch(() => {});
      if (requestId) error.generationId = requestId;
      throw error;
    }
  }
}
module.exports = {GenerateSubjectAssessment};
