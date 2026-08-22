function normalizeGroup(value) {
  const group = String(value || "").trim().toLowerCase();

  if (!group) {
    throw new Error("Generated question group is required.");
  }

  return group;
}

class WriteGeneratedQuestions {
  constructor(writersByGroup = {}) {
    this.writersByGroup = new Map(
      Object.entries(writersByGroup).map(([group, writer]) => {
        if (typeof writer !== "function") {
          throw new Error(`Question writer for ${group} must be a function.`);
        }

        return [normalizeGroup(group), writer];
      }),
    );
  }

  async execute(questionInputs) {
    if (!Array.isArray(questionInputs) || questionInputs.length === 0) {
      throw new Error("At least one generated question is required.");
    }

    const groups = new Set(
      questionInputs.map(({ group }) => normalizeGroup(group)),
    );

    if (groups.size !== 1) {
      throw new Error("All generated questions must use the same group.");
    }

    const group = [...groups][0];
    const writer = this.writersByGroup.get(group);

    if (!writer) {
      throw new Error(`No question writer is configured for group: ${group}.`);
    }

    return writer(questionInputs);
  }
}

module.exports = {
  WriteGeneratedQuestions,
};
