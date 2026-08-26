const {
  normalizeSiteAdminEmail,
} = require("../domain/site_admin_email");

class AddSiteAdminEmail {
  constructor(siteAdminRepository) {
    this.siteAdminRepository = siteAdminRepository;
  }

  async execute(email) {
    const normalizedEmail = normalizeSiteAdminEmail(email);

    await this.siteAdminRepository.save(normalizedEmail);

    return normalizedEmail;
  }
}

module.exports = {
  AddSiteAdminEmail,
};
