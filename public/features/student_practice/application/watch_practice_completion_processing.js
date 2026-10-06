function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} must be a function.`);
  }

  return value;
}

export class WatchPracticeCompletionProcessing {
  constructor({processingRepository} = {}) {
    if (!processingRepository || typeof processingRepository.watch !== "function") {
      throw new Error("processingRepository is required.");
    }

    this.processingRepository = processingRepository;
  }

  execute({studentId, practiceId, onChange, onError} = {}) {
    return this.processingRepository.watch({
      studentId,
      practiceId,
      onChange: requireFunction(onChange, "onChange"),
      onError: requireFunction(onError, "onError")
    });
  }
}
