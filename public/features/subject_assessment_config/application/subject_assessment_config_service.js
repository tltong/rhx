import {requireScope, requireConfigurationInput, requireSettingsInput, requireDocumentId} from "../domain/subject_assessment_config.js?v=20261109-assessment-repeat-policy-v1";

class SubjectAssessmentConfigService {
  constructor({repository, authorize}) {Object.assign(this, {repository, authorize});}

  async getSettings(context) {
    const access = await this.authorize(context);
    const result = await this.repository.getSettings();
    access.assertAccess?.();
    return result;
  }

  async saveSettings(input, context) {
    const settings = requireSettingsInput(input), access = await this.authorize(context);
    const updatedBy = requireDocumentId(access?.uid, "administrator UID");
    const result = await this.repository.saveSettings(settings, {updatedBy, assertAccess: access.assertAccess});
    access.assertAccess?.();
    return result;
  }

  async get(input, context) {
    const scope = requireScope(input);
    const access = await this.authorize(context);
    const result = await this.repository.get(scope);
    access.assertAccess?.();
    return result;
  }

  async options(input, context) {
    const scope = requireScope(input);
    const access = await this.authorize(context);
    const [selection, configuration] = await Promise.all([this.repository.options(scope), this.repository.get(scope)]);
    access.assertAccess?.();
    return {...selection, configuration};
  }

  async save(input, context) {
    const configuration = requireConfigurationInput(input);
    const access = await this.authorize(context);
    const updatedBy = requireDocumentId(access?.uid, "administrator UID");
    const result = await this.repository.save(configuration, {updatedBy, assertAccess: access.assertAccess});
    access.assertAccess?.();
    return result;
  }
}

export {SubjectAssessmentConfigService};
