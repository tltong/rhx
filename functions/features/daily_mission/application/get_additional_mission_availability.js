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
    return {missions, preparingEssay: pending.some(Boolean)};
  }
}
module.exports = {GetAdditionalMissionAvailability};
