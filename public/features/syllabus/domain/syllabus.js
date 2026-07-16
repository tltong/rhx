export class SyllabusTopic {
  constructor({
    id = null,
    topicName,
    subtopics = {}
  }) {
    this.id = id;
    this.topicName = topicName;
    this.subtopics = subtopics;
  }

  update({
    topicName,
    subtopics
  }) {
    if (topicName !== undefined) {
      this.topicName = topicName;
    }

    if (subtopics !== undefined) {
      this.subtopics = subtopics;
    }

    return this;
  }
}

export class Syllabus {
  constructor({
    id = null,
    country,
    level,
    year,
    subject,
    active = false,
    assessmentFrameworkId = null,
    topics = []
  }) {
    this.id = id;
    this.country = country;
    this.level = level;
    this.year = year;
    this.subject = subject;
    this.active = active;
    this.assessmentFrameworkId = assessmentFrameworkId;
    this.topics = topics;
  }

  update({
    country,
    level,
    year,
    subject,
    active,
    assessmentFrameworkId,
    topics
  }) {
    if (country !== undefined) {
      this.country = country;
    }

    if (level !== undefined) {
      this.level = level;
    }

    if (year !== undefined) {
      this.year = year;
    }

    if (subject !== undefined) {
      this.subject = subject;
    }

    if (active !== undefined) {
      this.active = active;
    }

    if (assessmentFrameworkId !== undefined) {
      this.assessmentFrameworkId = assessmentFrameworkId;
    }

    if (topics !== undefined) {
      this.topics = topics;
    }

    return this;
  }
}
