import {
  GUARDIANS_COLLECTION,
  guardianAuthTypes,
  guardianSchema
} from "../config/firebase/guardian_schema.js";
import { getFirebaseEmailAuth } from "../utils/firebase/firebase_email_auth.js";
import { getFirebaseGoogleAuth } from "../utils/firebase/firebase_google_auth.js?v=20260710-google-auth-fix";
import {
  createDocument,
  deleteDocument,
  readDocument,
  writeDocument
} from "../utils/firebase/firebase_ops.js";

export const GUARDIAN_AUTH_METHODS = {
  EMAIL: "email",
  GOOGLE: "google"
};
export const GUARDIAN_LANDING_PAGE_URL = "/pages/guardian_landing_page/guardian_landing_page.html";
export const GUARDIAN_SIGN_IN_PAGE_URL = "/pages/guardian_sign_in/guardian_sign_in.html";
export const GUARDIAN_SIGN_UP_PAGE_URL = "/pages/guardian_sign_up/guardian_sign_up.html";
export const GUARDIAN_LOG_OUT_REDIRECT_URL = "/index.html";

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeEmail(email) {
  const normalizedEmail = requireNonEmptyString(email, "email").toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("email must be a valid email address.");
  }

  return normalizedEmail;
}

function requirePassword(password) {
  return requireNonEmptyString(password, "password");
}

function deriveGuardianName(authUser, input = {}) {
  if (input.name || authUser.displayName) {
    return input.name || authUser.displayName;
  }

  if (authUser.email) {
    return authUser.email.split("@")[0];
  }

  return "";
}

function getCurrentAuthUser() {
  return getFirebaseEmailAuth().read() || getFirebaseGoogleAuth().read();
}

function requireCurrentAuthUser() {
  const auth = getFirebaseEmailAuth();

  if (typeof auth.requireCurrentUser === "function") {
    return auth.requireCurrentUser();
  }

  throw new Error("No authenticated guardian is currently signed in.");
}

function buildGuardianData(authUser, input = {}, authType = guardianAuthTypes.EMAIL) {
  const name = deriveGuardianName(authUser, input);
  const email = input.email || authUser.email;

  return {
    authUid: requireNonEmptyString(authUser.uid, "authUid"),
    name: requireNonEmptyString(name, "name"),
    email: normalizeEmail(email),
    registrationDate: input.registrationDate || new Date(),
    authMethod: input.authMethod || authType,
    authType
  };
}

async function ensureGuardianProfile(authUser, input = {}, authType = guardianAuthTypes.EMAIL) {
  const existingGuardian = await readDocument(GUARDIANS_COLLECTION, authUser.uid);

  if (existingGuardian) {
    const updates = {
      authUid: authUser.uid,
      email: normalizeEmail(authUser.email || existingGuardian.email),
      authMethod: existingGuardian.authMethod || authType,
      authType: existingGuardian.authType || authType
    };

    if (!existingGuardian.name && deriveGuardianName(authUser, input)) {
      updates.name = deriveGuardianName(authUser, input);
    }

    await writeDocument(GUARDIANS_COLLECTION, authUser.uid, updates);

    return {
      ...existingGuardian,
      ...updates
    };
  }

  const guardianData = buildGuardianData(authUser, input, authType);

  await createDocument(GUARDIANS_COLLECTION, guardianData, authUser.uid);

  return guardianData;
}

export function getGuardianSchema() {
  return guardianSchema;
}

export function getCurrentGuardianAuthUser() {
  return getCurrentAuthUser();
}

export function onGuardianAuthStateChanged(callback) {
  if (typeof callback !== "function") {
    throw new Error("callback must be a function.");
  }

  return getFirebaseEmailAuth().onAuthStateChanged(callback);
}

export async function createGuardianData(authUid, guardianData) {
  const id = requireNonEmptyString(authUid, "authUid");

  await createDocument(GUARDIANS_COLLECTION, guardianData, id);

  return readDocument(GUARDIANS_COLLECTION, id);
}

export async function readGuardianData(authUid) {
  return readDocument(GUARDIANS_COLLECTION, requireNonEmptyString(authUid, "authUid"));
}

export async function writeGuardianData(authUid, guardianData) {
  const id = requireNonEmptyString(authUid, "authUid");

  await writeDocument(GUARDIANS_COLLECTION, id, guardianData);

  return readDocument(GUARDIANS_COLLECTION, id);
}

export async function deleteGuardianData(authUid) {
  const id = requireNonEmptyString(authUid, "authUid");

  await deleteDocument(GUARDIANS_COLLECTION, id);

  return {
    authUid: id,
    deleted: true
  };
}

export async function signUpGuardianWithEmail({ name, email, password }) {
  const auth = getFirebaseEmailAuth();
  const normalizedEmail = normalizeEmail(email);
  const authUser = await auth.create(normalizedEmail, requirePassword(password), {
    displayName: requireNonEmptyString(name, "name")
  });

  try {
    const guardian = await ensureGuardianProfile(
      authUser,
      { name, email: normalizedEmail },
      guardianAuthTypes.EMAIL
    );

    return {
      user: authUser,
      guardian,
      landingPageUrl: GUARDIAN_LANDING_PAGE_URL
    };
  } catch (error) {
    try {
      await auth.delete();
    } catch (rollbackError) {
      console.warn("Could not roll back Firebase Auth user after guardian profile write failed.", rollbackError);
    }

    throw error;
  }
}

export async function signInGuardianWithEmail(email, password) {
  const authUser = await getFirebaseEmailAuth().signIn(
    normalizeEmail(email),
    requirePassword(password)
  );
  const guardian = await ensureGuardianProfile(
    authUser,
    { email: authUser.email },
    guardianAuthTypes.EMAIL
  );

  return {
    user: authUser,
    guardian,
    landingPageUrl: GUARDIAN_LANDING_PAGE_URL
  };
}

export async function signInGuardianWithGoogle(options = {}) {
  const result = await getFirebaseGoogleAuth().signIn(options);
  const authUser = result.user;
  const guardian = await ensureGuardianProfile(
    authUser,
    {
      name: authUser.displayName,
      email: authUser.email
    },
    guardianAuthTypes.GOOGLE
  );

  return {
    ...result,
    guardian,
    landingPageUrl: GUARDIAN_LANDING_PAGE_URL
  };
}

export async function signInGuardianWithGoogleRedirect(options = {}) {
  return getFirebaseGoogleAuth().signInWithRedirect(options);
}

export async function getGuardianGoogleRedirectResult() {
  const result = await getFirebaseGoogleAuth().getRedirectResult();

  if (!result.user) {
    return result;
  }

  const guardian = await ensureGuardianProfile(
    result.user,
    {
      name: result.user.displayName,
      email: result.user.email
    },
    guardianAuthTypes.GOOGLE
  );

  return {
    ...result,
    guardian,
    landingPageUrl: GUARDIAN_LANDING_PAGE_URL
  };
}

export async function signOutGuardian() {
  await getFirebaseEmailAuth().signOut();

  return {
    signedOut: true,
    redirectUrl: GUARDIAN_LOG_OUT_REDIRECT_URL
  };
}

export const logOutGuardian = signOutGuardian;

export async function getCurrentGuardian() {
  const user = getCurrentAuthUser();

  if (!user) {
    return null;
  }

  const guardian = await readGuardianData(user.uid);

  return {
    user,
    guardian
  };
}

export async function updateCurrentGuardian(updates = {}) {
  const auth = getFirebaseEmailAuth();
  const user = requireCurrentAuthUser();
  const guardianUpdates = {};

  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    guardianUpdates.name = requireNonEmptyString(updates.name, "name");
    await auth.update({ displayName: guardianUpdates.name });
  }

  if (Object.prototype.hasOwnProperty.call(updates, "email")) {
    guardianUpdates.email = normalizeEmail(updates.email);
    await auth.update({ email: guardianUpdates.email });
  }

  if (Object.keys(guardianUpdates).length === 0) {
    throw new Error("No valid guardian updates were provided.");
  }

  await writeDocument(GUARDIANS_COLLECTION, user.uid, guardianUpdates);

  return getCurrentGuardian();
}

export async function deleteCurrentGuardianAccount() {
  const user = requireCurrentAuthUser();

  await deleteDocument(GUARDIANS_COLLECTION, user.uid);
  await getFirebaseEmailAuth().delete();

  return {
    uid: user.uid,
    deleted: true
  };
}

export default {
  GUARDIAN_AUTH_METHODS,
  GUARDIAN_LANDING_PAGE_URL,
  GUARDIAN_SIGN_IN_PAGE_URL,
  GUARDIAN_SIGN_UP_PAGE_URL,
  GUARDIAN_LOG_OUT_REDIRECT_URL,
  getGuardianSchema,
  getCurrentGuardianAuthUser,
  onGuardianAuthStateChanged,
  createGuardianData,
  readGuardianData,
  writeGuardianData,
  deleteGuardianData,
  signUpGuardianWithEmail,
  signInGuardianWithEmail,
  signInGuardianWithGoogle,
  signInGuardianWithGoogleRedirect,
  getGuardianGoogleRedirectResult,
  signOutGuardian,
  logOutGuardian,
  getCurrentGuardian,
  updateCurrentGuardian,
  deleteCurrentGuardianAccount
};
