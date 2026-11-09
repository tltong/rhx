import * as assessmentApis from "../subject_assessment_module.js?v=20261108-student-subject-assessment-v1";
const isProcessing = state => state.generation && !state.generation.canRetry
  || state.latestSubmission && ["pending", "marking"].includes(state.latestSubmission.markingStatus) && state.latestResult?.assessmentId !== state.latestSubmission.assessmentId;

export class SubjectAssessmentDashboard {
  constructor({apis = assessmentApis, navigate = url => window.location.assign(url), schedule = (callback, delay) => setTimeout(callback, delay), cancel = timer => clearTimeout(timer),
    uuid = () => globalThis.crypto.randomUUID(), now = () => Date.now()} = {}) {
    Object.assign(this, {apis, navigate, schedule, cancel, uuid, now});
    this.roots = new Map(); this.labels = new Map(); this.requests = new Map(); this.pending = new Set(); this.openWhenReady = new Set(); this.version = 0;
    globalThis.document?.addEventListener?.("visibilitychange", () => {if (globalThis.document.visibilityState === "visible" && this.studentId) {this.polls = 0; void this.refresh();}});
  }
  begin(studentId) {
    if (this.studentId !== studentId) this.stop();
    this.studentId = studentId; this.version++; this.cancel(this.timer); this.roots.clear(); this.labels.clear(); this.polls = 0;
  }
  stop() {
    this.version++; this.studentId = null; this.cancel(this.timer); for (const root of this.roots.values()) root.replaceChildren();
    this.roots.clear(); this.labels.clear(); this.states?.clear(); this.requests.clear(); this.pending.clear(); this.openWhenReady.clear();
  }
  add(root, syllabusId, label = {}) {
    this.roots.set(syllabusId, root); root.className = "subject-assessment-box"; root.dataset.syllabusId = syllabusId;
    this.labels.set(syllabusId, label);
    this.render(syllabusId, null);
  }
  url(syllabusId, assessmentId) {
    const query = new URLSearchParams({syllabusId}); if (assessmentId) query.set("assessmentId", assessmentId);
    return "/features/subject_assessment/pages/assessment/subject_assessment.html?" + query;
  }
  render(syllabusId, state, error) {
    const root = this.roots.get(syllabusId); if (!root) return;
    const doc = root.ownerDocument || globalThis.document, node = (tag, text) => {const value = doc.createElement(tag); if (text !== undefined) value.textContent = text; return value;};
    const label = this.labels.get(syllabusId) || {}, heading = node("div"); heading.className = "subject-assessment-heading";
    heading.append(node("h3", label.subject || "Subject assessment"));
    if (label.language) {const language = node("span", label.language); language.className = "language-pill"; heading.append(language);}
    root.replaceChildren(); root.append(heading);
    const status = node("p"); status.setAttribute("role", "status"); status.className = "subject-assessment-status"; root.append(status);
    const actions = node("div"); actions.className = "subject-assessment-actions"; root.append(actions);
    const button = (label, handler) => {const value = node("button", label); value.type = "button"; value.disabled = this.pending.has(syllabusId); value.addEventListener("click", handler); actions.append(value); return value;};
    const link = (label, id) => {const value = node("a", label); value.href = this.url(syllabusId, id); actions.append(value);};
    if (error) {status.textContent = error; button("Check again", () => {this.polls = 0; void this.refresh();});}
    else if (!state) status.textContent = "Checking assessment availability…";
    else {
      this.states ||= new Map(); this.states.set(syllabusId, state);
      if (state.activeAssessment) {
        status.textContent = "Your assessment is ready to continue.";
        link(state.activeAssessment.status === "inProgress" ? "Resume assessment" : "Start assessment", state.activeAssessment.assessmentId);
      } else if (state.generation) {
        const job = state.generation;
        if (job.requestId) this.requests.set(syllabusId, job.requestId);
        status.textContent = job.canRetry ? "Assessment preparation was interrupted. You can resume preparation."
          : `Preparing your assessment${job.progress?.total ? `: ${job.progress.prepared} of ${job.progress.total} items ready` : ""}…`;
        if (job.canRetry) button("Retry preparation", () => {void this.start(syllabusId);});
      } else if (state.canStart) {
        status.textContent = "A subject assessment is available.";
        button("Take assessment", () => {void this.start(syllabusId);});
      } else if (state.reason === "cooldown" && state.nextAvailableAt) {
        status.textContent = "Next assessment available " + new Date(state.nextAvailableAt).toLocaleString() + ".";
      } else if (state.reason === "noRepeat") {
        status.textContent = "Your initial assessment has been submitted. Repeat assessments are disabled.";
      } else status.textContent = state.reason === "subjectNotConfigured"
        ? "Subject assessment is not configured yet." : "Subject assessment is not available yet.";
      const latest = state.latestSubmission;
      if (latest && latest.markingStatus !== "completed" && state.latestResult?.assessmentId !== latest.assessmentId) {
        root.append(node("p", latest.markingStatus === "failed" ? "Your submitted answers are saved. Marking needs to be retried."
          : `Marking your submitted assessment${latest.itemCount ? `: ${latest.markedItemCount} of ${latest.itemCount} items marked` : ""}. Your result will appear here.`));
        if (latest.markingStatus === "failed") button("Retry marking", () => {void this.retryMarking(syllabusId, latest.assessmentId);});
      }
      if (state.latestResult) {
        root.append(node("p", "Latest available score: " + Number(state.latestResult.score).toLocaleString(undefined, {maximumFractionDigits: 1}) + "%"));
        link("View result", state.latestResult.assessmentId);
      }
      button("Check availability", () => {this.polls = 0; void this.refresh();});
    }
    link("Assessment history");
  }
  async refresh() {
    if (!this.studentId || !this.roots.size) return;
    const version = ++this.version, studentId = this.studentId; this.cancel(this.timer);
    try {
      const overview = await this.apis.getStudentSubjectAssessmentOverview();
      if (version !== this.version || studentId !== this.studentId) return;
      const states = new Map(overview.subjects.map(state => [state.syllabusId, state]));
      for (const syllabusId of this.roots.keys()) {
        const state = states.get(syllabusId);
        this.render(syllabusId, state || {reason: "unavailable"});
        if (state?.activeAssessment && this.openWhenReady.has(syllabusId)) {
          this.openWhenReady.delete(syllabusId); this.navigate(this.url(syllabusId, state.activeAssessment.assessmentId)); return;
        }
      }
      const processing = overview.subjects.some(isProcessing);
      const next = overview.subjects.map(state => +new Date(state.nextAvailableAt)).filter(time => time > this.now());
      const delay = processing ? this.polls < 120 ? 5000 : 60000 : next.length ? Math.min(60000, Math.max(1000, Math.min(...next) - this.now() + 50)) : null;
      if (delay && (processing || this.polls < 120)) this.timer = this.schedule(() => {this.polls++; void this.refresh();}, delay);
    } catch (error) {
      if (version !== this.version || studentId !== this.studentId) return;
      for (const syllabusId of this.roots.keys()) this.render(syllabusId, null, "Could not check assessment availability. Please try again.");
      if (this.polls < 120 || this.states && [...this.states.values()].some(isProcessing)) this.timer = this.schedule(() => {this.polls++; void this.refresh();}, 60000);
    }
  }
  async start(syllabusId) {
    if (this.pending.has(syllabusId) || !this.studentId) return;
    const studentId = this.studentId;
    if (!this.states?.get(syllabusId)?.generation) this.requests.set(syllabusId, this.uuid());
    const requestId = this.requests.get(syllabusId) || this.uuid(); this.requests.set(syllabusId, requestId);
    this.pending.add(syllabusId); this.openWhenReady.add(syllabusId); this.render(syllabusId, this.states?.get(syllabusId));
    try {
      const result = await this.apis.startStudentSubjectAssessment({syllabusId, requestId});
      if (studentId !== this.studentId) return;
      if (result.requestId) this.requests.set(syllabusId, result.requestId);
      if (result.status === "ready") {this.openWhenReady.delete(syllabusId); this.navigate(this.url(syllabusId, result.assessmentId));}
    } catch (error) {
      if (studentId !== this.studentId) return;
      this.openWhenReady.delete(syllabusId);
      // A request may have committed before its response was lost. The next
      // overview reconciles the protected subject state before another start.
    } finally {if (studentId === this.studentId) {this.pending.delete(syllabusId); this.polls = 0; await this.refresh();}}
  }
  async retryMarking(syllabusId, assessmentId) {
    if (this.pending.has(syllabusId)) return;
    const studentId = this.studentId; this.pending.add(syllabusId); this.render(syllabusId, this.states?.get(syllabusId));
    try {await this.apis.retrySubjectAssessmentMarking({assessmentId});}
    catch { /* The next overview displays the saved status. */ }
    finally {if (studentId === this.studentId) {this.pending.delete(syllabusId); this.polls = 0; await this.refresh();}}
  }
}
