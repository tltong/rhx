function requireRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(name + " must be an object.");
  }
  return value;
}

function requireMiniQuestionCount(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("miniQuestionCount must be a positive safe integer.");
  }
  return value;
}

function requireMessageMap(value, name) {
  requireRecord(value, name);
  const entries = Object.entries(value);
  if (!entries.length) throw new Error(name + " must contain at least one language.");
  return Object.freeze(Object.fromEntries(entries.map(([language, message]) => {
    if (!language.trim() || language !== language.trim() || /^__.*__$/.test(language)
        || new TextEncoder().encode(language).length > 1500) {
      throw new Error(name + " must use nonempty language keys without surrounding whitespace or reserved field names.");
    }
    if (typeof message !== "string" || !message.trim()) {
      throw new Error(name + "." + language + " must be a nonempty message.");
    }
    return [language, message.trim()];
  })));
}

function requireConfigurationInput(input) {
  requireRecord(input, "Tutor configuration");
  const miniQuestionCount = requireMiniQuestionCount(input.miniQuestionCount);
  if (typeof input.promptInstructions !== "string") {
    throw new Error("promptInstructions must be a string.");
  }
  const correctAnswerMessage = requireMessageMap(input.correctAnswerMessage, "correctAnswerMessage");
  const incorrectAnswerMessage = requireMessageMap(input.incorrectAnswerMessage, "incorrectAnswerMessage");
  const languages = Object.keys(correctAnswerMessage);
  if (languages.length !== Object.keys(incorrectAnswerMessage).length
      || languages.some(language => !Object.hasOwn(incorrectAnswerMessage, language))) {
    throw new Error("correctAnswerMessage and incorrectAnswerMessage must contain the same language keys.");
  }
  return {
    miniQuestionCount, promptInstructions: input.promptInstructions.trim(),
    correctAnswerMessage, incorrectAnswerMessage,
  };
}

function requireAdministratorUid(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("updatedBy must be an administrator UID.");
  }
  return value.trim();
}

function requireTimestamp(value) {
  const date = value instanceof Date ? value : value?.toDate?.();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("updatedAt must be a valid timestamp.");
  }
  return new Date(date.getTime());
}

class TutorConfig {
  constructor(input) {
    Object.assign(this, requireConfigurationInput(input));
    this.updatedAt = requireTimestamp(input.updatedAt);
    this.updatedBy = requireAdministratorUid(input.updatedBy);
    Object.freeze(this);
  }
}

export {TutorConfig, requireConfigurationInput, requireMiniQuestionCount, requireMessageMap, requireAdministratorUid};

