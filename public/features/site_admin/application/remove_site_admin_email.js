import {
  normalizeSiteAdminEmail
} from "../domain/site_admin_email.js";

export class RemoveSiteAdminEmail {
  constructor(siteAdminGateway) {
    this.siteAdminGateway = siteAdminGateway;
  }

  async execute(email) {
    const result = await this.siteAdminGateway.removeEmail(
      normalizeSiteAdminEmail(email)
    );

    return normalizeSiteAdminEmail(result.email);
  }
}
