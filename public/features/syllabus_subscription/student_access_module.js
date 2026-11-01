import {FirestoreStudentSubscriptionRepository} from "./infrastructure/firestore_student_subscription_repository.js?v=20261031-subscription-cancel-v1";
import {studentSubscriptionAccess} from "./domain/student_subscription_access.js?v=20261031-subscription-cancel-v1";
import {watchDocument} from "../../utils/firebase/firebase_ops.js?v=20261031-renewal-restart-v1";
const repository = new FirestoreStudentSubscriptionRepository();

export async function requireStudentSubscriptionAccess(studentId) {
  const access = studentSubscriptionAccess(await repository.getSubscription(studentId, {source: "server"}));
  if (!access.allowed) throw Object.assign(new Error("Subscription access is suspended. Ask your guardian to resolve the renewal payment."),
    {code: "subscription-suspended"});
  return access;
}
export function watchStudentSubscriptionAccess(studentId, onChange, onError = () => {}) {
  let latest = null, timer = null, disposed = false, received = false;
  const evaluate = () => {
    if (disposed || !received) return;
    clearTimeout(timer);
    const access = studentSubscriptionAccess(latest);
    onChange(access);
    if (access.allowed && access.expiresAt) {
      timer = setTimeout(evaluate, Math.min(2147483647, Math.max(1, access.expiresAt.getTime() - Date.now())));
    }
  };
  const initialTimeout = setTimeout(() => {if (!received && !disposed) onError(new Error("Could not verify subscription access."));}, 10000);
  const unsubscribe = watchDocument("subscriptions", studentId, (data, snapshot) => {
    if (snapshot?.metadata?.fromCache) return;
    clearTimeout(initialTimeout); latest = data; received = true; evaluate();
  }, onError, {includeMetadataChanges: true});
  const visible = () => {if (globalThis.document?.visibilityState === "visible") evaluate();};
  globalThis.document?.addEventListener("visibilitychange", visible);
  return () => {disposed = true; clearTimeout(timer); clearTimeout(initialTimeout); unsubscribe(); globalThis.document?.removeEventListener("visibilitychange", visible);};
}
