import {requireCurrentFirebaseAuthUser} from "../firebase/firebase_auth.js";
import {requireCurrentSiteAdmin} from "../../features/site_admin/site_admin_module.js";
export function currentAccess() {
  const user = requireCurrentFirebaseAuthUser();
  return {updatedBy: user.uid, assertAccess() {
    const current = requireCurrentFirebaseAuthUser();
    if (current.uid !== user.uid || current.email !== user.email || current.emailVerified !== user.emailVerified) {
      throw Object.assign(new Error("The signed-in account changed. Reload the page."), {code: "unauthenticated"});
    }
  }};
}
export async function requireAdministrator(context = currentAccess()) {
  const user = requireCurrentFirebaseAuthUser();
  const status = await requireCurrentSiteAdmin(); context.assertAccess();
  if (!user.emailVerified || status.email !== user.email?.trim().toLowerCase()) throw new Error("A verified site administrator is required.");
  return user.uid;
}
export async function withAccess(operation, {admin = false} = {}) {
  const context = currentAccess();
  if (admin) await requireAdministrator(context);
  const result = await operation(context); context.assertAccess(); return result;
}
export function dates(value) {
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (Array.isArray(value)) return value.map(dates);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, dates(item)]));
}
