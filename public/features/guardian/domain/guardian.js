function requireNonEmptyString(value, name) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    throw new Error(`${name} is required.`);
  }

  return normalizedValue;
}

export class Guardian {
  constructor({
    id,
    authUid = id,
    name,
    email,
    registrationDate,
    authMethod,
    authType
  }) {
    this.id = requireNonEmptyString(id, "id");
    this.authUid = requireNonEmptyString(authUid, "authUid");

    if (this.id !== this.authUid) {
      throw new Error("Guardian id must match authUid.");
    }

    this.name = requireNonEmptyString(name, "name");
    this.email = requireNonEmptyString(email, "email").toLowerCase();
    this.registrationDate = registrationDate;
    this.authMethod = requireNonEmptyString(authMethod, "authMethod");
    this.authType = requireNonEmptyString(authType, "authType");
  }
}
