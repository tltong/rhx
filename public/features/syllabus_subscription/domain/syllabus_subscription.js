export class SyllabusSubscription {
  constructor({
    studentId,
    syllabusId,
    state = "active",
    subscribedAt = null,
    updatedAt = null
  }) {
    this.studentId = studentId;
    this.syllabusId = syllabusId;
    this.state = state;
    this.subscribedAt = subscribedAt;
    this.updatedAt = updatedAt;
  }

  activate(updatedAt = new Date()) {
    this.state = "active";

    if (!this.subscribedAt) {
      this.subscribedAt = updatedAt;
    }

    this.updatedAt = updatedAt;

    return this;
  }

  deactivate(updatedAt = new Date()) {
    this.state = "inactive";

    if (!this.subscribedAt) {
      this.subscribedAt = updatedAt;
    }

    this.updatedAt = updatedAt;

    return this;
  }

  update({
    state,
    subscribedAt,
    updatedAt
  }) {
    if (state !== undefined) {
      this.state = state;
    }

    if (subscribedAt !== undefined) {
      this.subscribedAt = subscribedAt;
    }

    if (updatedAt !== undefined) {
      this.updatedAt = updatedAt;
    }

    return this;
  }
}
