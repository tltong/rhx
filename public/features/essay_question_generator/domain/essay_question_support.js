function normalizeImagePrompt(value) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 12000) throw new Error("imagePrompt must be nonempty text of at most 12,000 characters.");
  return value.trim();
}
function normalizeSupportSettings(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Essay support settings must be an object.");
  if (Object.keys(value).some(key => !["pictureEnabled", "helpingWordsEnabled", "helpingWordCount"].includes(key))) throw new Error("Unsupported essay support setting.");
  const result = {pictureEnabled: value.pictureEnabled ?? false, helpingWordsEnabled: value.helpingWordsEnabled ?? false,
    helpingWordCount: value.helpingWordCount ?? 5};
  if (typeof result.pictureEnabled !== "boolean" || typeof result.helpingWordsEnabled !== "boolean"
      || !Number.isInteger(result.helpingWordCount) || result.helpingWordCount < 1 || result.helpingWordCount > 30) {
    throw new Error("Choose switches and a helping suggestion count from 1 to 30.");
  }
  return result;
}
function normalizeHelpingWords(value, count) {
  if (!Array.isArray(value) || value.length !== count || value.some(word => typeof word !== "string" || !word.trim() || word.length > 160)) {
    throw new Error("The helping suggestions do not match the configured count.");
  }
  const words = value.map(word => word.trim());
  if (new Set(words.map(word => word.normalize("NFKC").toLowerCase())).size !== count) throw new Error("Helping suggestions must be distinct.");
  return words;
}
function normalizeQuestionSupport(value) {
  if (value === undefined) return undefined; // Preserve legacy records without writing them.
  if (!value || typeof value !== "object" || value.version !== 1) throw new Error("Invalid essay question support.");
  const settings = normalizeSupportSettings(value.settings);
  const pictureStatus = value.pictureStatus, helpingWordsStatus = value.helpingWordsStatus;
  for (const [enabled, status] of [[settings.pictureEnabled, pictureStatus], [settings.helpingWordsEnabled, helpingWordsStatus]]) {
    if (enabled ? !["ready", "failed"].includes(status) : status !== "disabled") throw new Error("Invalid essay support outcome.");
  }
  const helpingWords = helpingWordsStatus === "ready" ? normalizeHelpingWords(value.helpingWords, settings.helpingWordCount) : [];
  let picture = null;
  if (pictureStatus === "ready") {
    const source = value.picture;
    if (!source || typeof source.storagePath !== "string" || !/^essay-question-images\/[A-Za-z0-9_-]{1,128}\.png$/.test(source.storagePath)
        || typeof source.url !== "string" || !/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\//.test(source.url)) throw new Error("Invalid essay picture.");
    picture = {url: source.url, storagePath: source.storagePath};
    // Old questions may retain a description; new pictures require no vision call.
    if (source.description !== undefined) {
      if (typeof source.description !== "string" || !source.description.trim() || source.description.length > 12000) throw new Error("Invalid legacy picture description.");
      picture.description = source.description.trim();
    }
  }
  return {version: 1, settings, pictureStatus, picture, helpingWordsStatus, helpingWords};
}
function questionSupportsSettings(question, settings) {
  const wanted = normalizeSupportSettings(settings);
  const saved = normalizeQuestionSupport(question.support);
  if (!saved) return !wanted.pictureEnabled && !wanted.helpingWordsEnabled;
  return saved.settings.pictureEnabled === wanted.pictureEnabled
    && saved.settings.helpingWordsEnabled === wanted.helpingWordsEnabled
    && (!wanted.helpingWordsEnabled || saved.settings.helpingWordCount === wanted.helpingWordCount);
}

export {normalizeImagePrompt, normalizeSupportSettings, normalizeHelpingWords, normalizeQuestionSupport, questionSupportsSettings};
