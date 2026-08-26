import {
  normalizeSiteAdminEmail
} from "../domain/site_admin_email.js";

export class IsCurrentUserSiteAdmin {
  constructor(siteAdminGateway) {
    this.siteAdminGateway = siteAdminGateway;
  }

  async execute() {
    const result = await this.siteAdminGateway.getCurrentStatus();

    return {
      email: result.email
        ? normalizeSiteAdminEmail(result.email)
        : null,
      emailVerified: result.emailVerified === true,
      isAdmin: result.isAdmin === true,
      bootstrapAvailable: result.bootstrapAvailable === true
    };
  }
}
