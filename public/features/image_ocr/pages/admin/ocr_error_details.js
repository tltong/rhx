const phaseLabels = {
  validation: "Validating image and settings", image: "Preparing the handwriting image",
  authentication: "Getting the sign-in token", request: "Sending the request / waiting for response headers",
  response: "Reading the server response", service: "Server returned an error", result: "Checking the OCR result",
  configuration: "Loading OCR settings and syllabus languages", save: "Saving OCR settings",
  submission: "Submitting the OCR job", polling: "Checking OCR job status",
};
const text = (value, max = 1000) => typeof value === "string" ? value.replace(/[\r\n]+/g, " ").slice(0, max) : "";
function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.origin + url.pathname : "Not available";
  } catch {return "Not available";}
}

export function describeOcrError(error, context = {}) {
  const code = text(error?.code, 100), name = text(error?.name, 100) || "Error";
  const message = text(error?.message) || "The OCR operation failed without an error message.";
  const phase = text(error?.phase, 100) || context.phase;
  const network = code === "ocr-network-error" || name === "TypeError" && /failed to fetch|networkerror|load failed/i.test(message);
  const actualStatus = error?.httpResponseReceived === false ? null : error?.httpStatus ?? error?.status;
  let summary = "The OCR operation could not be completed.";
  let guidance = "Use the error code, time, and server request ID below to check the function logs. Your handwriting and unsaved settings are preserved.";
  if (network) {
    summary = "The browser could not read a response from the OCR service.";
    guidance = "A connection interruption, a browser block, or a server/gateway failure can cause this error. The browser does not reveal which cause occurred, or whether the server received the image. Check your connection or try a private window or another network. The OCR request may still be processing; check before submitting it again.";
  } else if (code === "ocr-timeout" || actualStatus === 504 || name === "TimeoutError") {
    summary = "The OCR request exceeded its time limit.";
    guidance = "Check the failure stage and elapsed time below against the configured limits. The request may still be processing on the server; check the logs before submitting it again.";
  } else if (code === "unauthenticated" || code.startsWith("auth/") || actualStatus === 401) {
    summary = "The sign-in session could not be verified.";
    guidance = "Check your connection, sign in again, and reload the page. Getting a sign-in token can fail before any image request reaches the OCR service.";
  } else if (code === "permission-denied" || actualStatus === 403) {
    summary = "Access to this OCR operation was denied.";
    guidance = "Draft OCR tests and configuration changes require a verified site-administrator account. If that account is already verified, use the request ID to check backend permissions.";
  } else if (actualStatus === 429) {
    summary = "The OCR service is busy or its quota has been reached.";
    guidance = "Wait before making another request. Check provider capacity and quota in the server logs if this continues.";
  } else if (code === "invalid-argument" || actualStatus === 400) {
    summary = "The image or OCR settings did not pass validation.";
    guidance = "Review the error message and the image, language, provider, and request limits. Your handwriting and unsaved settings are preserved.";
  } else if (["invalid-response", "ocr-invalid-response"].includes(code) || phase === "result") {
    summary = "The OCR service did not return a usable transcription.";
    guidance = "The response may be incomplete or use an unexpected format. Use the HTTP status and request ID to check the server logs before starting another extraction.";
  } else if (phase === "image") {
    summary = "The handwriting image could not be prepared.";
    guidance = "The request may have failed before an image was sent. Your handwriting is preserved; check the browser error below.";
  } else if (name === "AbortError") {
    summary = "The OCR request was cancelled.";
    guidance = "Cancellation does not prove the server stopped processing. Check before starting another OCR request.";
  }
  if (error?.jobId && (error.jobState === "failed" || error.jobPending !== false) && code !== "ocr-job-expired") {
    guidance = error.jobState === "failed" ? "The job finished with an error and was not automatically resubmitted. Use its job ID to check function logs."
      : "Use Check previous OCR to retrieve this job's result without sending the image again. The background worker can continue after this page stops waiting. Job results are available for 15 minutes.";
  }
  const elapsed = Number.isFinite(error?.elapsedMs) ? error.elapsedMs : context.elapsedMs;
  const startedAt = error?.startedAt ?? context.startedAt;
  const date = new Date(startedAt);
  const status = Number.isInteger(actualStatus) && actualStatus >= 100 ? String(actualStatus)
    : error?.httpResponseReceived === false ? "No HTTP response accessible to the browser" : "Not available";
  const browserTimeout = Number.isFinite(error?.browserTimeoutMs) ? `${error.browserTimeoutMs / 1000} seconds` : "Not available";
  const online = error?.online ?? context.online;
  const facts = [
    ["Operation", text(context.operation) || "OCR"],
    ["Time (UTC)", Number.isFinite(date.getTime()) ? date.toISOString() : "Not available"],
    ["Provider", text(context.provider) || "Not resolved"], ["Model", text(context.model) || "Not resolved"],
    ["Language", text(context.language, 200) || "Not selected"],
    ["Failure stage", phaseLabels[phase] || "Not available"],
    ["Elapsed time", Number.isFinite(elapsed) ? `${(Math.max(0, elapsed) / 1000).toFixed(1)} seconds` : "Not available"],
    ["OCR timeout", Number.isFinite(context.timeoutSeconds) ? `${context.timeoutSeconds} seconds` : "Not available"],
    ["Browser timeout", browserTimeout], ["HTTP status", status],
    ["Error code", code || (network ? "ocr-network-error" : "Not provided")],
    ["Error type", name], ["Error message", message],
    ["Server request ID", text(error?.requestId, 200) || "Not received"],
    ["OCR job ID", text(error?.jobId, 100) || "Not provided"],
    ["Endpoint", safeUrl(error?.endpointUrl)], ["Page", safeUrl(context.pageUrl)],
    ["Browser connection", online === false ? "Offline" : online === true ? "Reports online (server reachability is unconfirmed)" : "Not available"],
  ];
  const details = facts.map(([label, value]) => `${label}: ${value}`).join("\n");
  return {summary, guidance, details, report: `${summary}\n\n${guidance}\n\n${details}`};
}
