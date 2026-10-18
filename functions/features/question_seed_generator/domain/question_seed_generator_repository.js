class QuestionSeedGeneratorRepository {
  async getConfig() { throw new Error("getConfig must be implemented."); }
  async saveConfig(input, options) { throw new Error("saveConfig must be implemented."); }
  async getEntries(vertical) { throw new Error("getEntries must be implemented."); }
  async saveEntries(input, options) { throw new Error("saveEntries must be implemented."); }
  async saveEntry(vertical, entry, options) { throw new Error("saveEntry must be implemented."); }
  // Atomically append only if no normalized duplicate exists; return true if added.
  async appendEntryIfUnique(vertical, entry, options) { throw new Error("appendEntryIfUnique must be implemented."); }
  // Atomically remove only selected entries and return the remaining list.
  async removeEntries(vertical, entries, options) { throw new Error("removeEntries must be implemented."); }
}

module.exports = {QuestionSeedGeneratorRepository};
