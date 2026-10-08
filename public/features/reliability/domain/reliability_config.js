import {requireTimestamp} from "./reliability_score.js?v=20261008-reliability-v1";

function requirePercentagePerPractice(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 100) {
    throw new Error("percentagePerPractice must be a finite number greater than 0 and at most 100.");
  }
  return value;
}

function requireConfigurationInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Reliability configuration must be an object.");
  }
  return {percentagePerPractice: requirePercentagePerPractice(input.percentagePerPractice)};
}

function requireAdministratorUid(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("updatedBy must be an administrator UID.");
  }
  return value.trim();
}

class ReliabilityConfig {
  constructor({percentagePerPractice, updatedAt, updatedBy}) {
    this.percentagePerPractice = requirePercentagePerPractice(percentagePerPractice);
    this.updatedAt = requireTimestamp(updatedAt, "updatedAt");
    this.updatedBy = requireAdministratorUid(updatedBy);
    Object.freeze(this);
  }
}

export {
  ReliabilityConfig, requirePercentagePerPractice,
  requireConfigurationInput, requireAdministratorUid,
};
