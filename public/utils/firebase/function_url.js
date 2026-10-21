import {firebaseConfig} from "../../config/firebase/firebase_config.js";

// Image generation calls the function directly so Hosting's shorter request
// deadline does not interrupt a long-running generation.
export function getHttpFunctionUrl(functionName, options = {}) {
  const projectId = options.projectId || firebaseConfig.projectId;
  const region = options.region || "us-central1";
  const hostname = options.hostname || globalThis.location?.hostname || "";
  if (options.useEmulator === true || ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    let host = options.emulatorHost || hostname || "localhost";
    if (host === "::1") host = "[::1]";
    return `${options.emulatorProtocol || "http"}://${host}:${options.emulatorPort || 5001}/${projectId}/${region}/${functionName}`;
  }
  return `https://${region}-${projectId}.cloudfunctions.net/${functionName}`;
}
