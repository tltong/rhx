const {resetScope, identifier} = require("../domain/reset_scope");
class ResetStudentTopicPractices {
  constructor(dependencies) {Object.assign(this, dependencies);}
  async preview(input, context) {
    await this.requireAdministrator(context);
    const plan = await this.planner.execute(input), {operations, ...preview} = plan;
    return {...preview, activeReset: await this.repository.getActive(preview.scope.studentId)};
  }
  async status(input, context) {
    await this.requireAdministrator(context);
    return this.repository.getStatus({studentId: identifier(input?.studentId, "studentId"), resetId: identifier(input?.resetId, "resetId")});
  }
  async request(input, context) {
    const scope = resetScope(input), actor = await this.requireAdministrator(context);
    const resetId = identifier(input.resetId, "resetId"), identity = {...scope, resetId};
    // Validate before acquiring a maintenance lock. A resume uses its durable plan.
    const existing = await this.repository.getStatus(identity);
    if (!existing) await this.planner.execute(scope);
    let state = await this.repository.claim(identity, actor.uid);
    if (state.status === "completed") return this.repository.getStatus(identity);
    const token = state.leaseToken;
    try {
      if (state.stage === "planning") {
        // Rebuild under the maintenance fence: records may have changed after the preview.
        const plan = await this.planner.execute(scope);
        await this.repository.savePlan(identity, token, plan);
        state = await this.repository.getStatus(identity);
      }
      for (let index = 0; index < state.totalSteps; index++) await this.repository.deleteStep(identity, token, index);
      await this.repository.markRecalculating(identity, token);
      const subject = {studentId: scope.studentId, syllabusId: scope.syllabusId};
      const [readiness, reliability] = await Promise.all([
        this.calculateSubjectReadinessScore(subject), this.calculateSubjectReliabilityScore(subject),
      ]);
      await this.repository.finish(identity, token, {readiness, reliability});
      return this.repository.getStatus(identity);
    } catch (error) {
      try {await this.repository.fail(identity, token, error);} catch { /* Another owner may have resumed the request. */ }
      throw Object.assign(error, {resetId});
    }
  }
}
module.exports = {ResetStudentTopicPractices};
