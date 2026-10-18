/**
 * Admin-only feature APIs. Uses an authenticated HTTPS admin endpoint, not a Firebase callable.
 * previewStudentTopicPracticeReset({studentId, syllabusId, topicId}) -> preview counts and activeReset
 * requestStudentTopicPracticeReset({studentId, syllabusId, topicId, resetId?}) -> completed job
 * getStudentTopicPracticeResetStatus({studentId, resetId}) -> job|null
 * Keep resetId when retrying a request. Failures retain the maintenance lock until resumed.
 */
import {requireCurrentFirebaseAuthRawUser} from "../../utils/firebase/firebase_auth.js";
import {requireCurrentSiteAdmin} from "../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {firebaseConfig} from "../../config/firebase/firebase_config.js";

export function createTopicResetClient({getUser = requireCurrentFirebaseAuthRawUser, requireAdmin = requireCurrentSiteAdmin,
  fetchImpl = (...args) => fetch(...args), endpoint = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/studentTopicPracticeReset` : "/api/student-topic-practice-reset"} = {}) {
  async function call(action, input) {
    const user = getUser(), uid = user.uid, email = user.email;
    const assertAccount = () => {const current = getUser(); if (current.uid !== uid || current.email !== email || !current.emailVerified) throw new Error("The signed-in administrator account changed. Try again.");};
    const status = await requireAdmin(); assertAccount();
    if (!user.emailVerified || user.email?.trim().toLowerCase() !== status.email) throw new Error("A verified site administrator is required.");
    const token = await user.getIdToken(); assertAccount();
    const response = await fetchImpl(endpoint, {method: "POST", headers: {"Content-Type": "application/json", Authorization: "Bearer " + token},
      body: JSON.stringify({action, input}), signal: AbortSignal.timeout(600000)});
    const data = await response.json(); assertAccount();
    if (!response.ok || data.error) throw Object.assign(new Error(data.error?.message ?? "The topic reset request failed."), {code: data.error?.code, resetId: input.resetId});
    return data.result;
  }
  return {
    previewStudentTopicPracticeReset: input => call("preview", input),
    requestStudentTopicPracticeReset: input => call("request", {...input, resetId: input.resetId ?? crypto.randomUUID()}),
    getStudentTopicPracticeResetStatus: input => call("status", input),
  };
}
const client = createTopicResetClient();
export const previewStudentTopicPracticeReset = client.previewStudentTopicPracticeReset;
export const requestStudentTopicPracticeReset = client.requestStudentTopicPracticeReset;
export const getStudentTopicPracticeResetStatus = client.getStudentTopicPracticeResetStatus;
