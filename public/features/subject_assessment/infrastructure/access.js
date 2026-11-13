import {requireCurrentFirebaseAuthUser} from "../../../utils/firebase/firebase_auth.js";
import {requireCurrentSiteAdmin} from "../../site_admin/site_admin_module.js?v=20260827-site-admin-guard-v1";
import {problem} from "../domain/subject_assessment.js?v=20261112-essay-variation-v1";
export async function requireAdministrator() {
  const user = requireCurrentFirebaseAuthUser();
  const assertAccess = () => {
    const current = requireCurrentFirebaseAuthUser();
    if (current.uid !== user.uid || current.email !== user.email || current.emailVerified !== user.emailVerified) throw problem("The signed-in account changed. Reload the page.", "unauthenticated");
  };
  const status = await requireCurrentSiteAdmin(); assertAccess();
  if (!user.emailVerified || status.email !== user.email?.trim().toLowerCase()) throw problem("A verified site administrator is required.", "permission-denied");
  return {uid: user.uid, assertAccess};
}
