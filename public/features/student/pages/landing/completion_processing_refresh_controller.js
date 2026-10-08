function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

export class CompletionProcessingRefreshController {
  constructor({
    watchPracticeCompletionProcessing,
    refreshDashboard,
    clearCompletionContext,
    setStatus,
    setProcessingActive,
    statuses,
    stages
  } = {}) {
    this.watchPracticeCompletionProcessing = requireFunction(
      watchPracticeCompletionProcessing,
      "watchPracticeCompletionProcessing"
    );
    this.refreshDashboard = requireFunction(
      refreshDashboard,
      "refreshDashboard"
    );
    this.clearCompletionContext = requireFunction(
      clearCompletionContext,
      "clearCompletionContext"
    );
    this.setStatus = requireFunction(setStatus, "setStatus");
    this.setProcessingActive = requireFunction(
      setProcessingActive,
      "setProcessingActive"
    );
    this.statuses = statuses;
    this.stages = stages;
    this.unsubscribe = null;
    this.terminalHandled = false;
    this.identity = null;
  }

  start({studentId, practiceId, syllabusId, topicId}) {
    this.stop();
    this.terminalHandled = false;
    this.identity = {studentId, practiceId, syllabusId, topicId};
    this.setProcessingActive(true, this.identity);
    this.setStatus(
      "Updating your level, readiness and reliability, and preparing your next practice..."
    );
    this.unsubscribe = this.watchPracticeCompletionProcessing({
      studentId,
      practiceId,
      onChange: (processing) => {
        void this.handleChange(processing);
      },
      onError: (error) => {
        this.handleError(error);
      }
    });

    return () => this.stop();
  }

  stop({clearActivity = true} = {}) {
    const unsubscribe = this.unsubscribe;

    this.unsubscribe = null;

    if (typeof unsubscribe === "function") {
      unsubscribe();
    }

    if (clearActivity) {
      this.setProcessingActive(false, this.identity);
    }
  }

  async handleChange(processing) {
    if (this.terminalHandled) {
      return;
    }

    if (!processing) {
      this.setStatus(
        "Waiting for your completed practice to be processed..."
      );
      return;
    }

    const processingFailed = processing.status === this.statuses.FAILED;
    if (processingFailed || processing.status === this.statuses.COMPLETED) {
      this.terminalHandled = true;
      this.stop({clearActivity: false});
      this.setStatus("Refreshing your updated dashboard...");
      const failureMessage =
        "Your practice was saved, but progress processing did not finish. Please refresh later.";

      try {
        await this.refreshDashboard(this.identity);
        if (processingFailed) {
          // Readiness and reliability can be saved before next-practice generation fails.
          // Keep the completion context so a later visit can observe a retry.
          this.setStatus(failureMessage, {isError: true});
        } else {
          this.clearCompletionContext();
          this.setStatus("Your dashboard is up to date.");
        }
      } catch (error) {
        const refreshMessage = error?.message || "Could not refresh your updated dashboard.";
        this.setStatus(
          processingFailed ? `${failureMessage} ${refreshMessage}` : refreshMessage,
          {isError: true}
        );
      } finally {
        this.setProcessingActive(false, this.identity);
      }

      return;
    }

    if (processing.stage === this.stages.GENERATING) {
      this.setStatus("Preparing and assigning your next practice...");
      return;
    }

    this.setStatus("Updating your topic level, readiness and reliability...");
  }

  handleError(error) {
    if (this.terminalHandled) {
      return;
    }

    this.terminalHandled = true;
    this.stop();
    this.setStatus(
      error?.message || "Could not monitor practice processing.",
      {isError: true}
    );
  }
}
