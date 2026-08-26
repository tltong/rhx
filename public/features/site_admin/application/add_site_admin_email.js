import {
  normalizeSiteAdminEmail
} from "../domain/site_admin_email.js";

export class AddSiteAdminEmail {
  constructor(siteAdminGateway) {
    this.siteAdminGateway = siteAdminGateway;
  }

  async execute(email) {
    const result = await this.siteAdminGateway.addEmail(
      normalizeSiteAdminEmail(email)
    );

    return {
      email: normalizeSiteAdminEmail(result.email),
      bootstrap: result.bootstrap === true
    };
  }
}
