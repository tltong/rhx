const {resetScope, resetError} = require("../domain/reset_scope");

class BuildResetPlan {
  constructor({getFirestoreDb, getStudentById, getSyllabusById, getPracticeById}) {
    Object.assign(this, {getFirestoreDb, getStudentById, getSyllabusById, getPracticeById});
  }
  async execute(input) {
    const scope = resetScope(input), {studentId, syllabusId, topicId} = scope;
    const [student, syllabus] = await Promise.all([this.getStudentById(studentId), this.getSyllabusById(syllabusId)]);
    if (!student || !syllabus?.topics.some(topic => topic.id === topicId)) throw resetError("not-found", "Student, syllabus or topic could not be found.");
    const db = this.getFirestoreDb(), operations = new Map(), warnings = [];
    const eachBatch = async (values, action, size = 20) => {
      for (let index = 0; index < values.length; index += size) await Promise.all(values.slice(index, index + size).map(action));
    };
    const list = async path => (await db.collection(path).get()).docs;
    const add = (path, category, kind = "delete") => operations.set(path, {path, category, kind});
    const tree = async (path, category) => {
      const ref = db.doc(path), snapshot = await ref.get();
      for (const collection of await ref.listCollections()) {
        await eachBatch(await collection.listDocuments(), child => tree(child.path, category));
      }
      if (snapshot.exists) add(path, category);
    };
    const matches = data => data?.syllabusId === syllabusId && data?.topicId === topicId;
    const assessments = await list(`studentAssessmentProgress/${studentId}/practiceAssessments`);
    const normalIds = new Set(assessments.filter(doc => matches(doc.data())).map(doc => doc.id));
    for (const kind of ["acceptedDailyMissionPractices", "acceptedAdditionalMissionPractices"]) {
      for (const doc of await list(`studentDailyMissions/${studentId}/${kind}`)) if (matches(doc.data())) normalIds.add(doc.id);
    }
    const normalRoot = `studentPractices/${studentId}`;
    const [normalAssigned, normalCompleted, essayAssigned, essayCompleted] = await Promise.all([
      list(`${normalRoot}/assignedPractices`), list(`${normalRoot}/completedPractices`),
      list(`studentEssayPractices/${studentId}/assignedEssayPractices`), list(`studentEssayPractices/${studentId}/completedEssayPractices`),
    ]);
    const definitions = new Map();
    await eachBatch([...new Set([...normalAssigned, ...normalCompleted].map(doc => doc.id))], async id => {
      definitions.set(id, await this.getPracticeById(id));
    });
    for (const doc of [...normalAssigned, ...normalCompleted]) {
      const practice = definitions.get(doc.id), questions = practice?.questions ?? [];
      const selected = questions.filter(matches);
      if (selected.length && selected.length !== questions.length) throw resetError("failed-precondition", "A practice contains this topic and other topics. Resetting it would remove another topic's work.");
      if (selected.length) normalIds.add(doc.id);
      if (!practice && !normalIds.has(doc.id)) warnings.push(`Practice ${doc.id} has no definition and could not be attributed to this topic.`);
    }
    for (const doc of normalAssigned) if (normalIds.has(doc.id)) add(doc.ref.path, "assignedPractices");
    for (const doc of normalCompleted) if (normalIds.has(doc.id)) add(doc.ref.path, "completedPractices");
    await eachBatch([...normalIds], id => tree(`practiceResults/${id}/studentSubmissions/${studentId}`, "practiceResults"));
    for (const doc of await list(`${normalRoot}/completionProcessing`)) if (normalIds.has(doc.id)) add(doc.ref.path, "completionProcessing");
    for (const doc of assessments) if (matches(doc.data()) || normalIds.has(doc.id)) add(doc.ref.path, "assessmentRecords");
    const essayIds = new Set(), questionIds = new Set(), retainedQuestionIds = new Set();
    for (const [documents, category] of [[essayAssigned, "assignedEssays"], [essayCompleted, "completedEssays"]]) {
      for (const doc of documents) {
        const data = doc.data();
        if (matches(data)) {essayIds.add(doc.id); questionIds.add(data.essayQuestionId); add(doc.ref.path, category);}
        else retainedQuestionIds.add(data.essayQuestionId);
      }
    }
    for (const doc of await list(`studentEssayPractices/${studentId}/questionUsage`)) {
      if ((matches(doc.data()) || questionIds.has(doc.id)) && !retainedQuestionIds.has(doc.id)) add(doc.ref.path, "essayQuestionUsage");
    }
    let protectedEssayResults = 0;
    for (const questionId of questionIds) {
      if (retainedQuestionIds.has(questionId)) {protectedEssayResults++; continue;}
      await tree(`essayResults/${studentId}/questions/${questionId}`, "essayResults");
    }
    for (const doc of await list(`studentEssayPracticeGenerations/${studentId}/completions`)) {
      if (essayIds.has(doc.id) || essayIds.has(doc.data().nextEssayPracticeId)) await tree(doc.ref.path, "essayGeneration");
    }
    await tree(`studentAssessmentProgress/${studentId}/syllabuses/${syllabusId}/topics/${topicId}`, "topicProgression");
    await tree(`studentReadiness/${studentId}/syllabuses/${syllabusId}/topics/${topicId}`, "topicReadiness");
    await tree(`reliability/${studentId}/syllabuses/${syllabusId}/topics/${topicId}`, "topicReliability");
    for (const doc of await list(`studentReadiness/${studentId}/syllabuses/${syllabusId}/history`)) {
      const data = doc.data();
      if ((data.practiceType === "essay" ? essayIds : normalIds).has(data.practiceId)) add(doc.ref.path, "subjectReadinessHistory");
    }
    const missions = `studentDailyMissions/${studentId}`;
    for (const kind of ["acceptedDailyMissionPractices", "acceptedDailyMissionEssays", "acceptedAdditionalMissionPractices", "acceptedAdditionalMissionEssays"]) {
      for (const doc of await list(`${missions}/${kind}`)) if (matches(doc.data())) add(doc.ref.path, "missionRecords");
    }
    await eachBatch(await db.collection(`${missions}/days`).listDocuments(), async day => {
      const path = `${day.path}/syllabuses/${syllabusId}`, snapshot = await db.doc(path).get();
      if (snapshot.data()?.coreMission?.topicId === topicId) add(path, "missionRecords", "clearCoreMission");
      for (const kind of ["coreTopics", "additionalTopics"]) await tree(`${path}/${kind}/${topicId}`, "missionRecords");
    }, 10);
    for (const kind of ["pausedTopics", "missionStats"]) await tree(`${missions}/${kind}/${syllabusId}/topics/${topicId}`, "missionRecords");
    const plan = [...operations.values()], counts = {};
    for (const operation of plan) counts[operation.category] = (counts[operation.category] ?? 0) + 1;
    return {scope, student: {id: studentId, name: student.name ?? student.username ?? studentId},
      syllabus: {id: syllabusId, subject: syllabus.subject}, topic: {id: topicId, name: syllabus.topics.find(topic => topic.id === topicId).topicName},
      counts, totalRecords: plan.length, protectedEssayResults, warnings: [...new Set(warnings)], operations: plan};
  }
}
module.exports = {BuildResetPlan};
