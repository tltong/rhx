const ESSAY_PRACTICE_URL = "/features/essay_practice_session/pages/essay_practice/essay_practice.html";
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

function isPracticeCompleted(syllabus, practiceId, practiceType = "normal") {
  return (Array.isArray(syllabus?.topics) ? syllabus.topics : []).some(
    (topic) => (
      Array.isArray(topic?.completedPractices)
      && topic.completedPractices.some(
        (practice) => practice?.practiceId === practiceId && (practice.practiceType ?? "normal") === practiceType
      )
    )
  );
}

function topicIdForPractice(practice, syllabusId) {
  if (!practice || !Array.isArray(practice.questions)) {
    return null;
  }

  if (
    practice.questions.length === 0
    || practice.questions.some(
      (question) => String(question?.syllabusId ?? "").trim() !== syllabusId
    )
  ) {
    return null;
  }

  const topicIds = new Set(practice.questions.map((question) => (
    String(question?.topicId ?? "").trim()
  )));

  return topicIds.size === 1 && !topicIds.has("")
    ? [...topicIds][0]
    : null;
}

function findTopicName(syllabus, topicId) {
  const topic = (Array.isArray(syllabus?.topics) ? syllabus.topics : [])
    .find((candidate) => candidate?.topicId === topicId);

  return topic?.topicName || "Topic details unavailable";
}

export class AdditionalMissionSection {
  constructor({
    studentId,
    syllabuses,
    getNextCoreDailyMission,
    listAdditionalMissionPracticeIds,
    listAdditionalMissions,
    getAdditionalMissionAvailability,
    acceptAdditionalDailyMission,
    pauseCoreDailyMission,
    isTopicPausable,
    getPracticeById,
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
    this.listAdditionalMissions = listAdditionalMissions;
    this.getAdditionalMissionAvailability = getAdditionalMissionAvailability;
    this.listAdditionalMissionPracticeIds = listAdditionalMissionPracticeIds;
    if (![listAdditionalMissions, getAdditionalMissionAvailability, listAdditionalMissionPracticeIds].some(value => typeof value === "function")) {
      throw new Error("An Additional Mission listing API is required.");
    }
    this.acceptAdditionalDailyMission = requireFunction(
      acceptAdditionalDailyMission,
      "acceptAdditionalDailyMission"
    );
    this.pauseCoreDailyMission = requireFunction(
      pauseCoreDailyMission,
      "pauseCoreDailyMission"
    );
    this.getPracticeById = requireFunction(
      getPracticeById ?? (async () => null),
      "getPracticeById"
    );
    this.onTopicPaused = requireFunction(onTopicPaused, "onTopicPaused");
    this.isTopicPausable = requireFunction(isTopicPausable, "isTopicPausable");
    this.navigate = requireFunction(navigate, "navigate");
    this.documentRef = requireDocument(documentRef);
    this.commencePracticeUrl = String(commencePracticeUrl || "").trim();
    this.syllabusById = new Map(this.syllabuses.map((syllabus) => [
      requireDocumentId(syllabus?.syllabusId, "syllabusId"),
      syllabus
    ]));
    this.availabilityBySyllabusId = new Map();
    this.subjectButtons = [];
    this.actionButtons = [];
    this.currentMission = null;
    this.selectedSyllabusId = null;
    this.requestVersion = 0;
    this.isBusy = false;
  }

  mount(container) {
    if (typeof container?.replaceChildren !== "function") {
      throw new Error("An Additional Mission container is required.");
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
    launchButton.className = "daily-mission-launch additional-mission-launch";
    launchButton.textContent = "Additional Mission";
    availabilitySummary.className = "daily-mission-status";
    availabilitySummary.setAttribute("role", "status");
    availabilitySummary.setAttribute("aria-live", "polite");
    workspace.className =
      "daily-mission-workspace additional-mission-workspace";
    workspace.hidden = true;
    header.className = "daily-mission-header";
    heading.textContent = "Additional Missions";
    description.textContent =
      "Complete today's Daily Mission for a subject to unlock one additional mission per topic.";
    header.append(heading, description);
    subjects.className = "daily-mission-subjects";
    subjects.setAttribute("role", "group");
    subjects.setAttribute("aria-label", "Additional Mission subjects");
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
      button.className = "daily-mission-subject additional-mission-subject";
      button.textContent = syllabusLabel(syllabus);
      button.disabled = true;
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-disabled", "true");
      button.addEventListener("click", () => this.promptForMission(syllabusId));
      this.subjectButtons.push({button, syllabusId});
      subjects.append(button);
    });

    if (this.subjectButtons.length === 0) {
      const empty = this.documentRef.createElement("p");

      empty.className = "daily-mission-empty";
      empty.textContent = "No active subjects are available.";
      subjects.append(empty);
    }

    launchButton.addEventListener("click", () => this.open());
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

  updateDisabledState() {
    this.subjectButtons.forEach(({button, syllabusId}) => {
      const availability = this.availabilityBySyllabusId.get(syllabusId);
      const unlocked = availability?.unlocked === true;
      const exhausted = availability?.hasMission === false;

      button.disabled = this.isBusy || (!unlocked && !availability?.error)
        || exhausted || availability?.preparingEssay === true;
      button.setAttribute("aria-disabled", String(button.disabled));
    });
    this.actionButtons.forEach((button) => {
      button.disabled = this.isBusy;
    });
  }

  setBusy(isBusy) {
    this.isBusy = isBusy;
    this.launchButton.disabled = isBusy;
    this.updateDisabledState();
  }

  renderAvailability() {
    this.subjectButtons.forEach(({button, syllabusId}) => {
      const availability = this.availabilityBySyllabusId.get(syllabusId);
      const label = syllabusLabel(this.syllabusById.get(syllabusId));

      button.textContent = availability?.preparingEssay ? `${label} — Preparing next essay` : availability?.hasMission === false
        ? `${label} — No more missions today`
        : label;
      button.title = availability?.preparingEssay ? "Preparing your next essay…" : availability?.error
        ? "Could not check mission availability"
        : availability?.hasMission === false
          ? "No more additional missions available for this subject today"
          : availability?.unlocked
            ? "Additional Missions available"
            : "Complete today's Daily Mission for this subject first";
    });

    const availability = [...this.availabilityBySyllabusId.values()];
    const hasError = availability.some((item) => item.error);
    const exhausted = availability.length === this.syllabuses.length
      && availability.every((item) => item.hasMission === false);
    const hasMission = availability.some((item) => item.hasMission === true);
    const preparingEssay = availability.some(item => item.preparingEssay);

    this.availabilitySummary.textContent = hasError
      ? "Could not check Additional Mission availability. Select a subject to retry."
      : this.syllabuses.length === 0
        ? "No active subjects are available."
        : preparingEssay ? "Preparing your next essay…" : exhausted
          ? "No more additional missions available today."
          : "Complete a Daily Mission to unlock additional practice.";
    this.availabilitySummary.className = hasError
      ? "daily-mission-status is-error"
      : "daily-mission-status";
    this.availabilitySummary.hidden = !hasError && hasMission;
    this.updateDisabledState();
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
    const availability = this.availabilityBySyllabusId.get(syllabusId);

    if (!syllabus) {
      throw new Error("The selected syllabus is unavailable.");
    }

    if (this.isBusy) {
      return;
    }

    if (availability?.error) {
      this.selectSubject(syllabusId);
      return this.refreshAvailability();
    }

    if (availability?.preparingEssay) {
      this.selectSubject(syllabusId); this.currentMission = null; this.actionButtons = []; this.result.replaceChildren();
      this.setStatus("Preparing your next essay…"); return;
    }

    if (availability?.hasMission === false) {
      this.requestVersion += 1;
      this.selectSubject(syllabusId);
      this.currentMission = null;
      this.setStatus("", {hidden: true});
      this.renderEmpty(syllabus);
      return;
    }

    if (availability?.unlocked !== true) {
      this.requestVersion += 1;
      this.selectSubject(syllabusId);
      this.currentMission = null;
      this.actionButtons = [];
      this.result.replaceChildren();
      this.setStatus(
        "Complete today's Daily Mission for this subject first."
      );
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
    question.textContent = "Get next additional mission?";
    actions.className = "daily-mission-actions";
    confirmButton.type = "button";
    confirmButton.className = "daily-mission-confirm";
    confirmButton.textContent = "Get Next Mission";
    confirmButton.addEventListener("click", () => this.loadMission(syllabusId));
    this.actionButtons = [confirmButton];
    actions.append(confirmButton);
    card.append(heading, question, actions);
    this.result.replaceChildren(card);
  }

  async open() {
    this.launchButton.hidden = true;
    this.workspace.hidden = false;
    await this.ready;

    if ([...this.availabilityBySyllabusId.values()].some((item) => item.error)) {
      await this.refreshAvailability();
    }
  }

  async refreshAvailability() {
    const requestVersion = ++this.requestVersion;

    this.currentMission = null;
    this.actionButtons = [];
    this.result.replaceChildren();
    this.setBusy(true);
    this.setStatus("Checking completed Daily Missions...");
    this.availabilitySummary.textContent = "Checking Additional Missions...";
    this.availabilitySummary.hidden = false;

    const results = await Promise.all(this.subjectButtons.map(
      async ({syllabusId}) => {
        const syllabus = this.syllabusById.get(syllabusId);

        try {
          const mission = await this.getNextCoreDailyMission({
            studentId: this.studentId,
            syllabusId
          });

          if (requestVersion !== this.requestVersion) {
            return false;
          }
          const unlocked = Boolean(
            mission?.isAccepted
            && isPracticeCompleted(syllabus, mission.practiceId, mission.practiceType ?? "normal")
          );

          const {missions, preparingEssay = false} = unlocked ? await this.findAvailability(syllabusId) : {missions: []};
          const hasMission = preparingEssay ? null : unlocked ? missions.length > 0 : mission ? null : false;

          if (requestVersion !== this.requestVersion) {
            return false;
          }

          this.availabilityBySyllabusId.set(syllabusId, {
            unlocked,
            mission,
            missions,
            preparingEssay,
            hasMission
          });
          return hasMission === true;
        } catch (error) {
          if (requestVersion === this.requestVersion) {
            this.availabilityBySyllabusId.set(syllabusId, {
              unlocked: false,
              error
            });
          }
          return false;
        }
      }
    ));

    if (requestVersion !== this.requestVersion) {
      return;
    }

    const unlockedCount = results.filter(Boolean).length;

    this.renderAvailability();
    this.setBusy(false);
    this.setStatus(
      unlockedCount === 0
        ? this.availabilitySummary.textContent
        : `${unlockedCount} subject${unlockedCount === 1 ? "" : "s"} unlocked.`
    );

    if (this.selectedSyllabusId && !this.availabilityBySyllabusId
      .get(this.selectedSyllabusId)?.error) {
      this.promptForMission(this.selectedSyllabusId);
    }
  }

  async findAvailability(syllabusId) {
    if (this.getAdditionalMissionAvailability) return this.getAdditionalMissionAvailability({studentId: this.studentId, syllabusId});
    return {missions: await this.findMissions(syllabusId), preparingEssay: false};
  }

  async findMissions(syllabusId) {
    if (this.listAdditionalMissions) return this.listAdditionalMissions({studentId: this.studentId, syllabusId});
    const practiceIds = await this.listAdditionalMissionPracticeIds({
      studentId: this.studentId,
      syllabusId
    });

    return (await Promise.all(
      (Array.isArray(practiceIds) ? practiceIds : []).map(
        async (practiceId) => {
          const normalizedPracticeId = requireDocumentId(practiceId, "practiceId");
          const practice = await this.getPracticeById(normalizedPracticeId);
          const topicId = topicIdForPractice(practice, syllabusId);

          return topicId ? {practiceId: normalizedPracticeId, topicId} : null;
        }
      )
    )).filter(Boolean);
  }

  renderEmpty(syllabus) {
    const empty = this.documentRef.createElement("div");
    const heading = this.documentRef.createElement("h3");
    const message = this.documentRef.createElement("p");

    empty.className = "daily-mission-card is-empty";
    heading.textContent = syllabusLabel(syllabus);
    message.textContent = "No more additional missions available for this subject today.";
    empty.append(heading, message);
    this.actionButtons = [];
    this.result.replaceChildren(empty);
  }

  renderMission(syllabus, mission, {pausable = false} = {}) {
    const card = this.documentRef.createElement("article");
    const eyebrow = this.documentRef.createElement("p");
    const heading = this.documentRef.createElement("h3");
    const actions = this.documentRef.createElement("div");
    const startButton = this.documentRef.createElement("button");

    card.className = "daily-mission-card additional-mission-card";
    eyebrow.className = "daily-mission-eyebrow";
    eyebrow.textContent = mission.practiceType === "essay" ? "Suggested additional essay mission" : "Suggested additional mission";
    heading.textContent = findTopicName(syllabus, mission.topicId);
    actions.className = "daily-mission-actions";
    startButton.type = "button";
    startButton.className = "daily-mission-accept";
    startButton.textContent = "Start Mission";
    startButton.addEventListener("click", () => this.acceptMission(mission));
    this.actionButtons = [startButton];
    actions.append(startButton);
    card.append(eyebrow, heading);

    if (pausable) {
      const explanation = this.documentRef.createElement("p");
      const pauseButton = this.documentRef.createElement("button");

      explanation.className = "daily-mission-pause-explanation";
      explanation.textContent =
        "If you have not learned this topic yet, it can be paused temporarily.";
      pauseButton.type = "button";
      pauseButton.className = "daily-mission-pause";
      pauseButton.textContent = "Not learned yet";
      pauseButton.addEventListener("click", () => this.pauseMission(mission));
      this.actionButtons.push(pauseButton);
      actions.append(pauseButton);
      card.append(explanation);
    }
    card.append(actions);
    this.result.replaceChildren(card);
  }

  async loadMission(syllabusId, {refresh = false} = {}) {
    const syllabus = this.syllabusById.get(syllabusId);
    const availability = this.availabilityBySyllabusId.get(syllabusId);

    if (!syllabus) {
      throw new Error("The selected syllabus is unavailable.");
    }

    if (availability?.preparingEssay) {this.setStatus("Preparing your next essay…"); return;}
    if (availability?.unlocked !== true) {
      this.setStatus(
        "Complete today's Daily Mission for this subject first."
      );
      return;
    }

    const requestVersion = this.requestVersion + 1;

    this.requestVersion = requestVersion;
    this.selectSubject(syllabusId);
    this.currentMission = null;
    this.result.replaceChildren();
    this.actionButtons = [];
    this.setBusy(true);
    this.setStatus("Finding additional missions...");

    try {
      const {missions, preparingEssay = false} = !refresh && !availability.error
        ? availability
        : await this.findAvailability(syllabusId);

      if (requestVersion !== this.requestVersion) {
        return;
      }

      const pausable = missions.length > 0
        ? await this.isTopicPausable(syllabusId, missions[0].topicId) === true
        : false;

      if (requestVersion !== this.requestVersion) {
        return;
      }

      this.availabilityBySyllabusId.set(syllabusId, {
        ...availability,
        missions,
        preparingEssay,
        hasMission: preparingEssay ? null : missions.length > 0
      });
      this.renderAvailability();

      if (preparingEssay && missions.length === 0) {
        this.setStatus("Preparing your next essay…"); return;
      } else if (missions.length === 0) {
        this.renderEmpty(syllabus);
      } else {
        this.currentMission = missions[0];
        this.renderMission(syllabus, this.currentMission, {pausable});
      }
      this.setStatus("", {hidden: true});
    } catch (error) {
      if (requestVersion === this.requestVersion) {
        this.availabilityBySyllabusId.set(syllabusId, {...availability, error});
        this.renderAvailability();
        this.setStatus(
          error?.message || "Could not load additional missions.",
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
    this.setStatus("Accepting your additional mission...");

    try {
      const accepted = await this.acceptAdditionalDailyMission({
        studentId: this.studentId,
        practiceId: mission.practiceId,
        ...(mission.practiceType === "essay" ? {practiceType: "essay"} : {})
      });

      this.navigate((accepted.practiceType ?? mission.practiceType) === "essay"
        ? ESSAY_PRACTICE_URL + "?essayPracticeId=" + encodeURIComponent(accepted.practiceId)
        : createCommencePracticeUrl(accepted.practiceId, this.commencePracticeUrl));
    } catch (error) {
      this.setStatus(
        error?.message || "Could not accept the additional mission.",
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
        error?.message || "Could not pause this Additional Mission topic.",
        {isError: true}
      );
      this.setBusy(false);
    }
  }
}

export {
  createCommencePracticeUrl,
  isPracticeCompleted,
  topicIdForPractice
};
