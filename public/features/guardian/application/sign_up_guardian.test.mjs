import assert from "node:assert/strict";
import test from "node:test";

import { SignUpGuardian } from "./sign_up_guardian.js";

test("email signup creates a guardian record keyed by the auth UID", async () => {
  let guardianInput = null;
  const useCase = new SignUpGuardian({
    guardianRepository: { getById: async () => null },
    createGuardian: {
      execute: async (input) => {
        guardianInput = input;
        return input;
      }
    },
    guardianAuthService: {
      signUpWithEmail: async () => ({
        uid: "guardian-1",
        email: "guardian@example.com"
      }),
      deleteEmailAccount: async () => ({ deleted: true })
    }
  });

  const result = await useCase.withEmail({
    name: "Guardian One",
    email: "guardian@example.com",
    password: "secret1"
  });

  assert.equal(result.guardian.id, "guardian-1");
  assert.equal(guardianInput.authUid, "guardian-1");
  assert.equal(guardianInput.authType, "email");
  assert.equal(guardianInput.authMethod, "password");
  assert.ok(guardianInput.registrationDate instanceof Date);
});

test("email signup deletes the new auth account when persistence fails", async () => {
  let rollbackCount = 0;
  const useCase = new SignUpGuardian({
    guardianRepository: { getById: async () => null },
    createGuardian: {
      execute: async () => {
        throw new Error("Firestore unavailable");
      }
    },
    guardianAuthService: {
      signUpWithEmail: async () => ({
        uid: "guardian-2",
        email: "guardian2@example.com"
      }),
      deleteEmailAccount: async () => {
        rollbackCount += 1;
      }
    }
  });

  await assert.rejects(
    useCase.withEmail({
      name: "Guardian Two",
      email: "guardian2@example.com",
      password: "secret2"
    }),
    /Firestore unavailable/
  );
  assert.equal(rollbackCount, 1);
});

test("Google signup reuses an existing guardian record", async () => {
  let createCount = 0;
  const existingGuardian = { id: "guardian-3", authType: "google" };
  const useCase = new SignUpGuardian({
    guardianRepository: {
      getById: async () => existingGuardian
    },
    createGuardian: {
      execute: async () => {
        createCount += 1;
      }
    },
    guardianAuthService: {
      signUpWithGoogle: async () => ({
        user: {
          uid: "guardian-3",
          email: "guardian3@example.com",
          displayName: "Guardian Three"
        },
        additionalUserInfo: { isNewUser: false }
      })
    }
  });

  const result = await useCase.withGoogle();

  assert.equal(result.guardian, existingGuardian);
  assert.equal(result.isNewGuardian, false);
  assert.equal(createCount, 0);
});
