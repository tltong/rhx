const LOCAL_WEB_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

function getAllowedWebOrigins(value = process.env.ALLOWED_WEB_ORIGINS || "") {
  const origins = [...new Set(value.split(",").map(origin => origin.trim()).filter(Boolean))];
  for (const origin of origins) {
    let url;
    try {url = new URL(origin);} catch { /* Reject invalid origins below. */ }
    if (!url || url.protocol !== "https:" || url.origin !== origin || url.hostname.includes("*")) {
      throw new Error("ALLOWED_WEB_ORIGINS must contain comma-separated HTTPS origins without paths, credentials, queries, or fragments.");
    }
  }
  // An unset value permits only local development, never a production fallback.
  return [...origins, LOCAL_WEB_ORIGIN];
}

function isAllowedWebOrigin(origin, allowedOrigins) {
  return typeof origin === "string" && allowedOrigins.some(allowed =>
    typeof allowed === "string" ? allowed === origin : allowed.test(origin));
}

module.exports = {getAllowedWebOrigins, isAllowedWebOrigin};
