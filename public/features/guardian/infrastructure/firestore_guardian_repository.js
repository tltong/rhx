import { Guardian } from "../domain/guardian.js";
import { GuardianRepository } from "../domain/guardian_repository.js";
import {
  GUARDIANS_COLLECTION,
  guardianAuthTypes
} from "../../../config/firebase/guardian_schema.js";
import {
  readDocument,
  writeDocument
} from "../../../utils/firebase/firebase_ops.js";

const GUARDIAN_AUTH_TYPE_VALUES = new Set(Object.values(guardianAuthTypes));

function toGuardian(data) {
  if (!data) {
    return null;
  }

  return new Guardian({
    id: data.id,
    authUid: data.authUid,
    name: data.name,
    email: data.email,
    registrationDate: data.registrationDate,
    authMethod: data.authMethod,
    authType: data.authType
  });
}

function toGuardianRecord(guardian) {
  if (!GUARDIAN_AUTH_TYPE_VALUES.has(guardian.authType)) {
    throw new Error(
      `authType must be one of: ${Object.values(guardianAuthTypes).join(", ")}.`
    );
  }

  return {
    authUid: guardian.authUid,
    name: guardian.name,
    email: guardian.email,
    registrationDate: guardian.registrationDate,
    authMethod: guardian.authMethod,
    authType: guardian.authType
  };
}

export class FirestoreGuardianRepository extends GuardianRepository {
  async getById(guardianId) {
    const data = await readDocument(GUARDIANS_COLLECTION, guardianId);

    return toGuardian(data);
  }

  async save(guardian) {
    await writeDocument(
      GUARDIANS_COLLECTION,
      guardian.id,
      toGuardianRecord(guardian),
      { merge: false }
    );

    return guardian;
  }
}
