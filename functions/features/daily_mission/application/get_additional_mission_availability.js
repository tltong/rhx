class GetAdditionalMissionAvailability {
  constructor(dependencies) {Object.assign(this, dependencies);}
  async execute(input) {
    const missions = await this.listAdditionalMissions(input);
    if (missions.length) return {missions, preparingEssay: false};
    const {studentId, syllabusId} = input, date = await this.getCurrentDate();
    const core = await this.dailyMissionRepository.getCoreMission({...input, date});
    if (!core || !await this.dailyMissionRepository.isPracticeCompleted({studentId, practiceId: core.practiceId, practiceType: core.practiceType})) {
      return {missions, preparingEssay: false};
    }
    const accepted = new Set(await this.dailyMissionRepository.listAcceptedAdditionalTopicIds({...input, date}));
    const latestByTopic = new Map();
    let cursor = null;
    do {
      const page = await this.listCompletedEssayPractices({studentId, syllabusId, limit: 100, cursor});
      for (const practice of page.practices) {
        if (practice.syllabusId !== syllabusId || accepted.has(practice.topicId)) continue;
        const previous = latestByTopic.get(practice.topicId);
        if (!previous || practice.completedAt > previous.completedAt) latestByTopic.set(practice.topicId, practice);
      }
      cursor = page.nextCursor;
    } while (cursor);
    const pending = await Promise.all([...latestByTopic.values()].map(async practice => {
      const paused = await this.checkPausedTopicValidity({studentId, syllabusId, topicId: practice.topicId});
      if (paused.isPaused) return false;
      const generation = await this.dailyMissionRepository.getEssayGenerationStatus({studentId, essayPracticeId: practice.essayPracticeId});
      return generation?.status !== "completed";
    }));
    let fillCursor = null; const latestFillByTopic = new Map();
    do {
      const page = this.listCompletedFillInTheBlanksPractices ? await this.listCompletedFillInTheBlanksPractices({studentId, syllabusId, limit: 100, cursor: fillCursor}) : {practices: [], nextCursor: null};
      for (const practice of page.practices) {
        if (practice.syllabusId !== syllabusId || accepted.has(practice.topicId)) continue;
        const previous = latestFillByTopic.get(practice.topicId);
        if (!previous || practice.completedAt > previous.completedAt) latestFillByTopic.set(practice.topicId, practice);
      }
      fillCursor = page.nextCursor;
    } while (fillCursor);
    let preparingFillInTheBlanks = false, generationError = null;
    for (const practice of latestFillByTopic.values()) {
      if ((await this.checkPausedTopicValidity({studentId, syllabusId, topicId: practice.topicId})).isPaused) continue;
      const state = await this.dailyMissionRepository.getFillInTheBlanksGenerationStatus({studentId, practiceId: practice.practiceId});
      const processing = this.dailyMissionRepository.getFillInTheBlanksCompletionProcessing ? await this.dailyMissionRepository.getFillInTheBlanksCompletionProcessing({studentId, practiceId: practice.practiceId}) : null;
      const until = state?.leaseUntil?.toDate?.() ?? state?.leaseUntil;
      const processingUntil = processing?.leaseUntil?.toDate?.() ?? processing?.leaseUntil;
      const stale = state?.status === "generating" && until && new Date(until).getTime() <= Date.now()
        || processing?.status === "processing" && processingUntil && new Date(processingUntil).getTime() <= Date.now();
      if (state?.status === "failed" || processing?.status === "failed" || stale) generationError = {practiceId: practice.practiceId, message: state?.errorMessage || "The next fill-in-the-blanks practice could not be prepared."};
      else if (state?.status !== "completed") preparingFillInTheBlanks = true;
    }
    return {missions, preparingEssay: pending.some(Boolean), ...(preparingFillInTheBlanks ? {preparingFillInTheBlanks: true} : {}),
      ...(generationError ? {fillInTheBlanksGenerationError: generationError} : {})};
  }
}
module.exports = {GetAdditionalMissionAvailability};
