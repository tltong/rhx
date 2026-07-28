const GUARDIANS_COLLECTION = "guardians";

const guardianAuthTypes = {
  EMAIL: "email",
  GOOGLE: "google"
};

const guardianSchema = {
  authUid: "string",
  name: "string",
  email: "string",
  registrationDate: "timestamp",
  authMethod: "string",
  authType: "string"
};

module.exports = {
  GUARDIANS_COLLECTION,
  guardianAuthTypes,
  guardianSchema
};
