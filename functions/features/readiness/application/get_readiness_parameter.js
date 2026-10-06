class GetReadinessParameter {
  constructor(getReadinessConfig, parameter) {
    this.getReadinessConfig = getReadinessConfig;
    this.parameter = parameter;
  }

  async execute() {
    const config = await this.getReadinessConfig();
    if (!config) {
      const error = new Error("Readiness has not been configured.");
      error.code = "failed-precondition";
      throw error;
    }
    return config[this.parameter];
  }
}

module.exports = {GetReadinessParameter};
