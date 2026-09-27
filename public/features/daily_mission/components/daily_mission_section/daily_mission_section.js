const DEFAULT_COMMENCE_PRACTICE_URL =
  "/features/practice_session/pages/commence_practice/commence_practice.html";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

function requireDocumentId(value, fieldName) {
  const id = String(value ?? "").trim();

  if (!id) {
    throw new Error(`${fieldName} is required.`);
  }

  if (id.includes("/")) {
    throw new Error(`${fieldName} must not contain a slash.`);
  }

  return id;
}

function requireDocument(documentRef) {
  if (typeof documentRef?.createElement !== "function") {
    throw new Error("A browser document is required.");
  }

  return documentRef;
}

function defaultNavigate(url) {
  if (typeof globalThis.window?.location?.assign !== "function") {
    throw new Error("Browser navigation is not available.");
  }

  globalThis.window.location.assign(url);
}

function createCommencePracticeUrl(practiceId, baseUrl) {
  return `${baseUrl}?practiceId=${encodeURIComponent(practiceId)}`;
}

function syllabusLabel(syllabus) {
  const subject = String(syllabus?.subject || "Subject unavailable").trim();
  const language = String(syllabus?.language || "").trim();

  return language ? `${subject} · ${language}` : subject;
}

function findTopicName(syllabus, topicId) {
  const topic = (Array.isArray(syllabus?.topics) ? syllabus.topics : [])
    .find((candidate) => candidate?.topicId === topicId);

  return topic?.topicName || "Topic details unavailable";
}

function isPracticeCompleted(syllabus, practiceId) {
  return (Array.isArray(syllabus?.topics) ? syllabus.topics : []).some(
    (topic) => (
      Array.isArray(topic?.completedPractices)
      && topic.completedPractices.some(
        (practice) => practice?.practiceId === practiceId
      )
    )
  );
}

export class DailyMissionSection {
  constructor({
    studentId,
    syllabuses,
    getNextCoreDailyMission,
    acceptCoreDailyMission,
    pauseCoreDailyMission,
    commencePracticeUrl = DEFAULT_COMMENCE_PRACTICE_URL,
    navigate = defaultNavigate,
    documentRef = globalThis.document
  } = {}) {
    this.studentId = requireDocumentId(studentId, "studentId");
    this.syllabuses = Array.isArray(syllabuses) ? syllabuses : [];
    this.getNextCoreDailyMission = requireFunction(
      getNextCoreDailyMission,
      "getNextCoreDailyMission"
    );
    this.acceptCoreDailyMission = requireFunction(
      acceptCoreDailyMission,
      "acceptCoreDailyMission"
    );
    this.pauseCoreDailyMission = requireFunction(
      pauseCoreDailyMission,
      "pauseCoreDailyMission"
    );
    this.navigate = requireFunction(navigate, "navigate");
    this.documentRef = requireDocument(documentRef);
    this.commencePracticeUrl = String(commencePracticeUrl || "").trim();
    this.syllabusById = new Map(this.syllabuses.map((syllabus) => [
      requireDocumentId(syllabus?.syllabusId, "syllabusId"),
      syllabus
    ]));
    this.subjectButtons = [];
    this.actionButtons = [];
    this.currentMission = null;
    this.selectedSyllabusId = null;
    this.requestVersion = 0;
  }

  mount(container) {
    if (typeof container?.replaceChildren !== "function") {
      throw new Error("A Daily Mission container is required.");
    }

    const launchButton = this.documentRef.createElement("button");
    const workspace = this.documentRef.createElement("div");
    const header = this.documentRef.createElement("div");
    const heading = this.documentRef.createElement("h2");
    const description = this.documentRef.createElement("p");
    const subjects = this.documentRef.createElement("div");
    const status = this.documentRef.createElement("p");
    const result = this.documentRef.createElement("div");

    launchButton.type = "button";
    launchButton.className = "daily-mission-launch";
    launchButton.textContent = "Daily Mission";
    workspace.className = "daily-mission-workspace";
    workspace.hidden = true;
    header.className = "daily-mission-header";
    heading.textContent = "Daily Mission";
    description.textContent = "Choose a subject for today's core mission.";
    header.append(heading, description);
    subjects.className = "daily-mission-subjects";
    subjects.setAttribute("role", "group");
    subjects.setAttribute("aria-label", "Daily Mission subjects");
    status.className = "daily-mission-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.hidden = true;
    result.className = "daily-mission-result";
    result.setAttribute("aria-live", "polite");

    this.syllabuses.forEach((syllabus) => {
      const syllabusId = requireDocumentId(
        syllabus?.syllabusId,
        "syllabusId"
      );
      const button = this.documentRef.createElement("button");

      button.type = "button";
      button.className = "daily-mission-subject";
      button.textContent = syllabusLabel(syllabus);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => this.loadMission(syllabusId));
      this.subjectButtons.push({button, syllabusId});
      subjects.append(button);
    });

    if (this.subjectButtons.length === 0) {
      const empty = this.documentRef.createElement("p");

      empty.className = "daily-mission-empty";
      empty.textContent = "No active subjects are available.";
      subjects.append(empty);
    }

    launchButton.addEventListener("click", () => {
      launchButton.hidden = true;
      workspace.hidden = false;
    });
    workspace.append(header, subjects, status, result);
    container.replaceChildren(launchButton, workspace);

    this.launchButton = launchButton;
    this.workspace = workspace;
    this.status = status;
    this.result = result;

    return container;
  }

  setStatus(message, {isError = false, hidden = false} = {}) {
    this.status.textContent = message;
    this.status.className = isError
      ? "daily-mission-status is-error"
      : "daily-mission-status";
    this.status.hidden = hidden;
  }

  setBusy(isBusy) {
    this.subjectButtons.forEach(({button}) => {
      button.disabled = isBusy;
    });
    this.actionButtons.forEach((button) => {
      button.disabled = isBusy;
    });
  }

  selectSubject(syllabusId) {
    this.selectedSyllabusId = syllabusId;
    this.subjectButtons.forEach(({button, syllabusId: buttonSyllabusId}) => {
      button.setAttribute(
        "aria-pressed",
        String(buttonSyllabusId === syllabusId)
      );
    });
  }

  renderEmptyMission(syllabus) {
    const empty = this.documentRef.createElement("div");
    const heading = this.documentRef.createElement("h3");
    const message = this.documentRef.createElement("p");

    empty.className = "daily-mission-card is-empty";
    heading.textContent = syllabusLabel(syllabus);
    message.textContent = "No core daily mission is currently available.";
    empty.append(heading, message);
    this.actionButtons = [];
    this.result.replaceChildren(empty);
  }

  renderMission(syllabus, mission) {
    const card = this.documentRef.createElement("article");
    const eyebrow = this.documentRef.createElement("p");
    const heading = this.documentRef.createElement("h3");
    const details = this.documentRef.createElement("p");

    card.className = "daily-mission-card";
    eyebrow.className = "daily-mission-eyebrow";
    eyebrow.textContent = mission.isAccepted
      ? "Today's accepted mission"
      : "Suggested core mission";
    heading.textContent = syllabusLabel(syllabus);
    details.className = "daily-mission-topic";
    details.textContent = findTopicName(syllabus, mission.topicId);
    card.append(eyebrow, heading, details);
    this.actionButtons = [];

    if (mission.isAccepted) {
      const completed = isPracticeCompleted(syllabus, mission.practiceId);

      if (completed) {
        const complete = this.documentRef.createElement("p");

        complete.className = "daily-mission-complete";
        complete.textContent = "Today's mission is complete.";
        card.append(complete);
      } else {
        const start = this.documentRef.createElement("a");

        start.className = "daily-mission-start";
        start.href = createCommencePracticeUrl(
          mission.practiceId,
          this.commencePracticeUrl
        );
        start.textContent = "Start Mission";
        card.append(start);
      }
    } else {
      const pauseExplanation = this.documentRef.createElement("p");
      const actions = this.documentRef.createElement("div");
      const acceptButton = this.documentRef.createElement("button");
      const pauseButton = this.documentRef.createElement("button");

      pauseExplanation.className = "daily-mission-pause-explanation";
      pauseExplanation.textContent =
        "If you have not learned this topic yet, it can be paused temporarily.";
      actions.className = "daily-mission-actions";
      acceptButton.type = "button";
      acceptButton.className = "daily-mission-accept";
      acceptButton.textContent = "Accept Mission";
      pauseButton.type = "button";
      pauseButton.className = "daily-mission-pause";
      pauseButton.textContent = "Not learned yet";
      acceptButton.addEventListener("click", () => (
        this.acceptMission(mission)
      ));
      pauseButton.addEventListener("click", () => (
        this.pauseMission(mission)
      ));
      this.actionButtons = [acceptButton, pauseButton];
      actions.append(acceptButton, pauseButton);
      card.append(pauseExplanation, actions);
    }

    this.result.replaceChildren(card);
  }

  async loadMission(syllabusId) {
    const syllabus = this.syllabusById.get(syllabusId);

    if (!syllabus) {
      throw new Error("The selected syllabus is unavailable.");
    }

    const requestVersion = this.requestVersion + 1;

    this.requestVersion = requestVersion;
    this.selectSubject(syllabusId);
    this.currentMission = null;
    this.actionButtons = [];
    this.result.replaceChildren();
    this.setBusy(true);
    this.setStatus("Finding your Daily Mission...");

    try {
      const mission = await this.getNextCoreDailyMission({
        studentId: this.studentId,
        syllabusId
      });

      if (requestVersion !== this.requestVersion) {
        return;
      }

      this.currentMission = mission;

      if (mission) {
        this.renderMission(syllabus, mission);
      } else {
        this.renderEmptyMission(syllabus);
      }

      this.setStatus("", {hidden: true});
    } catch (error) {
      if (requestVersion === this.requestVersion) {
        this.setStatus(
          error?.message || "Could not load a Daily Mission.",
          {isError: true}
        );
      }
    } finally {
      if (requestVersion === this.requestVersion) {
        this.setBusy(false);
      }
    }
  }

  async acceptMission(mission) {
    this.setBusy(true);
    this.setStatus("Accepting your Daily Mission...");

    try {
      const accepted = await this.acceptCoreDailyMission({
        studentId: this.studentId,
        practiceId: mission.practiceId
      });

      this.navigate(createCommencePracticeUrl(
        accepted.practiceId,
        this.commencePracticeUrl
      ));
    } catch (error) {
      this.setStatus(
        error?.message || "Could not accept the Daily Mission.",
        {isError: true}
      );
      this.setBusy(false);
    }
  }

  async pauseMission(mission) {
    const syllabusId = this.selectedSyllabusId;

    this.setBusy(true);
    this.setStatus("Pausing this topic...");

    try {
      await this.pauseCoreDailyMission({
        studentId: this.studentId,
        practiceId: mission.practiceId
      });
      this.currentMission = null;
      this.result.replaceChildren();
      await this.loadMission(syllabusId);
    } catch (error) {
      this.setStatus(
        error?.message || "Could not pause this Daily Mission topic.",
        {isError: true}
      );
      this.setBusy(false);
    }
  }
}

export {
  createCommencePracticeUrl,
  isPracticeCompleted
};
