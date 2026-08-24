import assert from "node:assert/strict";
import test from "node:test";

import { SignInGuardian } from "./sign_in_guardian.js";

test("email sign in returns the matching guardian", async () => {
  const guardian = { id: "guardian-1", name: "Guardian One" };
  const useCase = new SignInGuardian({
    guardianRepository: {
      getById: async (guardianId) => guardianId === guardian.id ? guardian : null
    },
    guardianAuthService: {
      signInWithEmail: async () => ({
        uid: "guardian-1",
        email: "guardian@example.com"
      }),
      signOut: async () => ({ signedOut: true })
    }
  });

  const result = await useCase.withEmail({
    email: "guardian@example.com",
    password: "secret1"
  });

  assert.equal(result.guardian, guardian);
  assert.equal(result.authUser.uid, "guardian-1");
});

test("email sign in signs out when no guardian profile exists", async () => {
  let signOutCount = 0;
  const useCase = new SignInGuardian({
    guardianRepository: { getById: async () => null },
    guardianAuthService: {
      signInWithEmail: async () => ({
        uid: "not-a-guardian",
        email: "student@example.com"
      }),
      signOut: async () => {
        signOutCount += 1;
      }
    }
  });

  await assert.rejects(
    useCase.withEmail({
      email: "student@example.com",
      password: "secret1"
    }),
    (error) => error.code === "guardian/profile-not-found"
  );
  assert.equal(signOutCount, 1);
});

test("Google sign in deletes a newly created non-guardian auth account", async () => {
  let deleteCount = 0;
  const useCase = new SignInGuardian({
    guardianRepository: { getById: async () => null },
    guardianAuthService: {
      signInWithGoogle: async () => ({
        user: {
          uid: "new-google-user",
          email: "new@example.com"
        },
        additionalUserInfo: { isNewUser: true }
      }),
      deleteGoogleAccount: async () => {
        deleteCount += 1;
      },
      signOut: async () => ({ signedOut: true })
    }
  });

  await assert.rejects(
    useCase.withGoogle(),
    (error) => error.code === "guardian/profile-not-found"
  );
  assert.equal(deleteCount, 1);
});
