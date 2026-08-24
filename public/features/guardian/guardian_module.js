import { CreateGuardian } from "./application/create_guardian.js";
import { GetGuardian } from "./application/get_guardian.js";
import { SignInGuardian } from "./application/sign_in_guardian.js";
import { SignUpGuardian } from "./application/sign_up_guardian.js";
import { GuardianAuthService } from "./auth/guardian_auth_service.js?v=20260825-guardian-sign-in-v2";
import { FirestoreGuardianRepository } from "./infrastructure/firestore_guardian_repository.js";

const guardianRepository = new FirestoreGuardianRepository();
const guardianAuthService = new GuardianAuthService();
const createGuardian = new CreateGuardian(guardianRepository);
const getGuardian = new GetGuardian(guardianRepository);
const signInGuardian = new SignInGuardian({
  guardianRepository,
  guardianAuthService
});
const signUpGuardian = new SignUpGuardian({
  guardianRepository,
  createGuardian,
  guardianAuthService
});

async function signUpGuardianWithEmail(input) {
  return signUpGuardian.withEmail(input);
}

async function signUpGuardianWithGoogle() {
  return signUpGuardian.withGoogle();
}

async function signInGuardianWithEmail(input) {
  return signInGuardian.withEmail(input);
}

async function signInGuardianWithGoogle() {
  return signInGuardian.withGoogle();
}

async function getGuardianById(guardianId) {
  return getGuardian.execute(guardianId);
}

async function signOutGuardian() {
  return guardianAuthService.signOut();
}

function onGuardianAuthStateChanged(callback) {
  return guardianAuthService.onAuthStateChanged(callback);
}

export {
  getGuardianById,
  onGuardianAuthStateChanged,
  signInGuardianWithEmail,
  signInGuardianWithGoogle,
  signOutGuardian,
  signUpGuardianWithEmail,
  signUpGuardianWithGoogle
};
