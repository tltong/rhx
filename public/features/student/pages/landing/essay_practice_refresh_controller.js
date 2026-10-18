export class EssayPracticeRefreshController {
  constructor({watchUpdates, refreshDashboard, onError = () => {}, schedule = (fn, ms) => setTimeout(fn, ms), cancel = clearTimeout}) {
    Object.assign(this, {watchUpdates, refreshDashboard, onError, schedule, cancel});
    this.revision = 0; this.stopWatch = null; this.timer = null; this.running = false; this.dirty = false;
  }
  start(studentId) {
    this.stop(); const revision = this.revision;
    const changed = () => {
      if (revision !== this.revision) return;
      this.dirty = true;
      if (this.running || this.timer !== null) return;
      this.timer = this.schedule(() => {this.timer = null; void this.refresh(studentId, revision);}, 200);
    };
    try {this.stopWatch = this.watchUpdates({studentId}, changed, error => {if (revision === this.revision) this.onError(error);});}
    catch (error) {this.onError(error);}
    this.changed = changed;
  }
  async refresh(studentId, revision) {
    if (revision !== this.revision) return;
    this.running = true; this.dirty = false;
    try {await this.refreshDashboard(studentId);}
    catch (error) {if (revision === this.revision) this.onError(error);}
    finally {
      if (revision === this.revision) {this.running = false; if (this.dirty) this.changed();}
    }
  }
  stop() {
    this.revision++; this.stopWatch?.(); this.stopWatch = null;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null; this.running = false; this.dirty = false;
  }
}
