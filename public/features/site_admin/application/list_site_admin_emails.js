import {
  normalizeSiteAdminEmail
} from "../domain/site_admin_email.js";

export class ListSiteAdminEmails {
  constructor(siteAdminGateway) {
    this.siteAdminGateway = siteAdminGateway;
  }

  async execute() {
    const result = await this.siteAdminGateway.listEmails();
    const emails = Array.isArray(result.emails)
      ? result.emails.map(normalizeSiteAdminEmail)
      : [];

    return {
      emails,
      bootstrapAvailable: result.bootstrapAvailable === true
    };
  }
}
