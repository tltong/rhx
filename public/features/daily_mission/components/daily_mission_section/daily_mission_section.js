const ESSAY_PRACTICE_URL = "/features/essay_practice_session/pages/essay_practice/essay_practice.html";
function createMissionUrl(mission, normalUrl) {
  return mission.practiceType === "essay" ? ESSAY_PRACTICE_URL + "?essayPracticeId=" + encodeURIComponent(mission.practiceId)
    : createCommencePracticeUrl(mission.practiceId, normalUrl);
}
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

  return language ? `${subject} - ${language}` : subject;
}

function findTopicName(syllabus, topicId) {
  const topic = (Array.isArray(syllabus?.topics) ? syllabus.topics : [])
    .find((candidate) => candidate?.topicId === topicId);

  return topic?.topicName || "Topic details unavailable";
}

function isPracticeCompleted(syllabus, practiceId, practiceType) {
  return (Array.isArray(syllabus?.topics) ? syllabus.topics : []).some(
    (topic) => (
      Array.isArray(topic?.completedPractices)
      && topic.completedPractices.some(
        (practice) => practice?.practiceId === practiceId && (practice.practiceType === "essay") === (practiceType === "essay")
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
    isTopicPausable,
    onTopicPaused = async () => {},
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
    this.onTopicPaused = requireFunction(
      onTopicPaused,
      "onTopicPaused"
    );
    this.isTopicPausable = requireFunction(
      isTopicPausable,
      "isTopicPausable"
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
    this.availabilityBySyllabusId = new Map();
    this.currentMission = null;
    this.selectedSyllabusId = null;
    this.requestVersion = 0;
    this.isBusy = false;
  }

  mount(container) {
    if (typeof container?.replaceChildren !== "function") {
      throw new Error("A Daily Mission container is required.");
    }

    const launchButton = this.documentRef.createElement("button");
    const availabilitySummary = this.documentRef.createElement("p");
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
    availabilitySummary.className = "daily-mission-status";
    availabilitySummary.setAttribute("role", "status");
    availabilitySummary.setAttribute("aria-live", "polite");
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
      button.disabled = true;
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => (
        this.promptForMission(syllabusId)
      ));
      this.subjectButtons.push({button, syllabusId});
      subjects.append(button);
    });

    if (this.subjectButtons.length === 0) {
      const empty = this.documentRef.createElement("p");

      empty.className = "daily-mission-empty";
      empty.textContent = "No active subjects are available.";
      subjects.append(empty);
    }

    launchButton.addEventListener("click", async () => {
      launchButton.hidden = true;
      workspace.hidden = false;
      await this.ready;
    });
    workspace.append(header, subjects, status, result);
    container.replaceChildren(launchButton, availabilitySummary, workspace);

    this.launchButton = launchButton;
    this.availabilitySummary = availabilitySummary;
    this.workspace = workspace;
    this.status = status;
    this.result = result;
    this.ready = this.refreshAvailability();

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
    this.isBusy = isBusy;
    this.launchButton.disabled = isBusy;
    this.subjectButtons.forEach(({button, syllabusId}) => {
      const availability = this.availabilityBySyllabusId.get(syllabusId);

      button.disabled = isBusy || !availability
        || availability.hasMission === false;
      button.setAttribute("aria-disabled", String(button.disabled));
    });
    this.actionButtons.forEach((button) => {
      button.disabled = isBusy;
    });
  }

  updateAvailability(syllabusId, mission) {
    const syllabus = this.syllabusById.get(syllabusId);
    const hasMission = Boolean(mission) && !(
      mission.isAccepted && isPracticeCompleted(syllabus, mission.practiceId, mission.practiceType)
    );

    this.availabilityBySyllabusId.set(syllabusId, {mission, hasMission});
  }

  renderAvailability() {
    this.subjectButtons.forEach(({button, syllabusId}) => {
      const availability = this.availabilityBySyllabusId.get(syllabusId);
      const label = syllabusLabel(this.syllabusById.get(syllabusId));

      button.textContent = availability?.hasMission === false
        ? `${label} — No more missions today`
        : label;
    });

    const availability = [...this.availabilityBySyllabusId.values()];
    const hasError = availability.some((item) => item.error);
    const exhausted = availability.length === this.syllabuses.length
      && availability.every((item) => item.hasMission === false);

    this.availabilitySummary.textContent = hasError
      ? "Could not check Daily Mission availability. Select a subject to retry."
      : this.syllabuses.length === 0
        ? "No active subjects are available."
        : "No more daily missions available today.";
    this.availabilitySummary.className = hasError
      ? "daily-mission-status is-error"
      : "daily-mission-status";
    this.availabilitySummary.hidden = !hasError && !exhausted;
    this.setBusy(this.isBusy);
  }

  async refreshAvailability() {
    const requestVersion = ++this.requestVersion;

    this.currentMission = null;
    this.actionButtons = [];
    this.result.replaceChildren();
    this.setBusy(true);
    this.availabilitySummary.textContent = "Checking Daily Missions...";
    this.availabilitySummary.hidden = false;

    await Promise.all(this.subjectButtons.map(async ({syllabusId}) => {
      try {
        const mission = await this.getNextCoreDailyMission({
          studentId: this.studentId,
          syllabusId
        });

        if (requestVersion === this.requestVersion) {
          this.updateAvailability(syllabusId, mission);
        }
      } catch (error) {
        if (requestVersion === this.requestVersion) {
          this.availabilityBySyllabusId.set(syllabusId, {error});
        }
      }
    }));

    if (requestVersion !== this.requestVersion) {
      return;
    }

    this.renderAvailability();
    this.setBusy(false);

    if (this.selectedSyllabusId) {
      this.promptForMission(this.selectedSyllabusId);
    }
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

  promptForMission(syllabusId) {
    const syllabus = this.syllabusById.get(syllabusId);

    if (!syllabus) {
      throw new Error("The selected syllabus is unavailable.");
    }

    if (this.isBusy) {
      return;
    }

    if (this.availabilityBySyllabusId.get(syllabusId)?.hasMission === false) {
      this.requestVersion += 1;
      this.selectSubject(syllabusId);
      this.currentMission = null;
      this.setStatus("", {hidden: true});
      this.renderEmptyMission(syllabus);
      return;
    }

    const card = this.documentRef.createElement("article");
    const heading = this.documentRef.createElement("h3");
    const question = this.documentRef.createElement("p");
    const actions = this.documentRef.createElement("div");
    const confirmButton = this.documentRef.createElement("button");

    this.requestVersion += 1;
    this.selectSubject(syllabusId);
    this.currentMission = null;
    this.setStatus("", {hidden: true});
    card.className = "daily-mission-card is-confirmation";
    heading.textContent = syllabusLabel(syllabus);
    question.textContent = "Get next mission?";
    actions.className = "daily-mission-actions";
    confirmButton.type = "button";
    confirmButton.className = "daily-mission-confirm";
    confirmButton.textContent = "Get Next Mission";
    confirmButton.addEventListener("click", () => (
      this.loadMission(syllabusId)
    ));
    this.actionButtons = [confirmButton];
    actions.append(confirmButton);
    card.append(heading, question, actions);
    this.result.replaceChildren(card);
  }

  renderEmptyMission(syllabus) {
    const empty = this.documentRef.createElement("div");
    const heading = this.documentRef.createElement("h3");
    const message = this.documentRef.createElement("p");

    empty.className = "daily-mission-card is-empty";
    heading.textContent = syllabusLabel(syllabus);
    message.textContent = "No more daily missions available for this subject today.";
    empty.append(heading, message);
    this.actionButtons = [];
    this.result.replaceChildren(empty);
  }

  renderMission(syllabus, mission, {pausable = false} = {}) {
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
    details.textContent = findTopicName(syllabus, mission.topicId) + (mission.practiceType === "essay" ? " — Essay assessment" : "");
    card.append(eyebrow, heading, details);
    this.actionButtons = [];

    if (mission.isAccepted) {
      const completed = isPracticeCompleted(syllabus, mission.practiceId, mission.practiceType);

      if (completed) {
        const complete = this.documentRef.createElement("p");

        complete.className = "daily-mission-complete";
        complete.textContent = "No more daily missions available for this subject today.";
        card.append(complete);
      } else {
        const start = this.documentRef.createElement("a");

        start.className = "daily-mission-start";
        start.href = createMissionUrl(
          mission,
          this.commencePracticeUrl
        );
        start.textContent = "Start Mission";
        card.append(start);
      }
    } else {
      const actions = this.documentRef.createElement("div");
      const acceptButton = this.documentRef.createElement("button");

      actions.className = "daily-mission-actions";
      acceptButton.type = "button";
      acceptButton.className = "daily-mission-accept";
      acceptButton.textContent = "Accept Mission";
      acceptButton.addEventListener("click", () => (
        this.acceptMission(mission)
      ));
      this.actionButtons = [acceptButton];
      actions.append(acceptButton);

      if (pausable) {
        const pauseExplanation = this.documentRef.createElement("p");
        const pauseButton = this.documentRef.createElement("button");

        pauseExplanation.className = "daily-mission-pause-explanation";
        pauseExplanation.textContent =
          "If you have not learned this topic yet, it can be paused temporarily.";
        pauseButton.type = "button";
        pauseButton.className = "daily-mission-pause";
        pauseButton.textContent = "Not learned yet";
        pauseButton.addEventListener("click", () => this.pauseMission(mission));
        this.actionButtons.push(pauseButton);
        actions.append(pauseButton);
        card.append(pauseExplanation);
      }
      card.append(actions);
    }

    this.result.replaceChildren(card);
  }

  async loadMission(syllabusId, {refresh = false} = {}) {
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
      const availability = this.availabilityBySyllabusId.get(syllabusId);
      const mission = !refresh && availability && !availability.error
        ? availability.mission
        : await this.getNextCoreDailyMission({
          studentId: this.studentId,
          syllabusId
        });

      if (requestVersion !== this.requestVersion) {
        return;
      }

      const pausable = mission && !mission.isAccepted
        ? await this.isTopicPausable(syllabusId, mission.topicId) === true
        : false;

      if (requestVersion !== this.requestVersion) {
        return;
      }

      this.currentMission = mission;
      this.updateAvailability(syllabusId, mission);
      this.renderAvailability();

      if (this.availabilityBySyllabusId.get(syllabusId).hasMission) {
        this.renderMission(syllabus, mission, {pausable});
      } else {
        this.renderEmptyMission(syllabus);
      }

      this.setStatus("", {hidden: true});
    } catch (error) {
      if (requestVersion === this.requestVersion) {
        this.availabilityBySyllabusId.set(syllabusId, {error});
        this.renderAvailability();
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
        practiceId: mission.practiceId,
        ...(mission.practiceType === "essay" ? {practiceType: "essay"} : {})
      });

      this.navigate(createMissionUrl(
        accepted,
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
      const pauseRoute = {
        studentId: this.studentId,
        syllabusId,
        topicId: mission.topicId
      };

      await this.pauseCoreDailyMission({
        studentId: this.studentId,
        practiceId: mission.practiceId,
        ...(mission.practiceType === "essay" ? {practiceType: "essay"} : {})
      });

      try {
        await this.onTopicPaused(pauseRoute);
      } catch (refreshError) {
        console.error("Could not refresh the paused topic status.", refreshError);
      }

      this.currentMission = null;
      this.result.replaceChildren();
      await this.loadMission(syllabusId, {refresh: true});
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
