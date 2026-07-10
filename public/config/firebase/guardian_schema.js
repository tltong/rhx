export const GUARDIANS_COLLECTION = "guardians";

export const guardianAuthTypes = {
  EMAIL: "email",
  GOOGLE: "google"
};

export const guardianSchema = {
  authUid: "string",
  name: "string",
  email: "string",
  registrationDate: "timestamp",
  authMethod: "string",
  authType: "string"
};

export default {
  GUARDIANS_COLLECTION,
  guardianAuthTypes,
  guardianSchema
};
