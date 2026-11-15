const TRANSIENT_CODES = new Set(["internal", "unavailable", "deadline-exceeded", "aborted", "cancelled"]);
export function isTransientNewsError(error) {
  const code = String(error?.code || "").split("/").at(-1);
  return TRANSIENT_CODES.has(code) || error?.name === "TypeError" && /fetch|network/i.test(error.message || "");
}
export function newsFetchErrorMessage(error) {
  const message = String(error?.message || "").trim();
  if (!message || /^(?:internal|unavailable|deadline-exceeded|aborted|cancelled|failed to fetch|network error)$/i.test(message)) {
    return "Could not confirm article preparation. Retry to resume your saved article.";
  }
  return message;
}
