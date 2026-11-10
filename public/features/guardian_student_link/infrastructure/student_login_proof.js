import {getFirebaseApp, getFirebaseNamespace} from "../../../utils/firebase/firebase_ops.js";
import {requireCurrentFirebaseAuthUser} from "../../../utils/firebase/firebase_auth.js";

/** Authenticate in a temporary, memory-only app; never replace the guardian's session. */
export async function confirmStudentLogin({username, pin}) {
  const name = String(username ?? "").trim().toLowerCase(), password = String(pin ?? "").trim();
  if (!/^[a-z0-9._-]{3,40}$/.test(name) || !/^\d{6}$/.test(password)) throw new Error("Enter a valid student username and six-digit PIN.");
  const guardian = requireCurrentFirebaseAuthUser(), primary = getFirebaseApp(), firebase = getFirebaseNamespace();
  const secondary = firebase.initializeApp(primary.options, "student-link-proof-" + globalThis.crypto.randomUUID());
  let auth;
  try {
    auth = secondary.auth();
    const emulator = primary.auth().emulatorConfig;
    if (emulator) auth.useEmulator(`${emulator.protocol}://${emulator.host}:${emulator.port}`, {disableWarnings: true});
    await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
    const credential = await auth.signInWithEmailAndPassword(name + "@rhx.com", password);
    const studentIdToken = await credential.user.getIdToken(true);
    if (requireCurrentFirebaseAuthUser().uid !== guardian.uid) throw Object.assign(new Error("The guardian account changed. Reload before linking."), {code: "guardian/account-changed"});
    return {studentId: credential.user.uid, studentIdToken};
  } catch (error) {
    if (error.code === "guardian/account-changed") throw error;
    if (error.code === "auth/network-request-failed") throw new Error("The student login could not be checked. Retry when the connection is available.");
    throw new Error("Could not confirm the student's username and PIN. Check the login details and try again.");
  } finally {
    if (auth) await auth.signOut().catch(() => {});
    await secondary.delete().catch(() => {});
  }
}
