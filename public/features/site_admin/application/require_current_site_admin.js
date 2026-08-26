export class RequireCurrentSiteAdmin {
  constructor(isCurrentUserSiteAdmin) {
    this.isCurrentUserSiteAdmin = isCurrentUserSiteAdmin;
  }

  async execute() {
    const status = await this.isCurrentUserSiteAdmin();

    if (!status.email) {
      throw new Error("Sign in with a site-admin account.");
    }

    if (!status.emailVerified) {
      throw new Error("Verify the signed-in email before continuing.");
    }

    if (!status.isAdmin) {
      throw new Error("The signed-in account is not a site administrator.");
    }

    return status;
  }
}
