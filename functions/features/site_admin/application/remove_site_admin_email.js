const {
  normalizeSiteAdminEmail,
} = require("../domain/site_admin_email");

class RemoveSiteAdminEmail {
  constructor(siteAdminRepository) {
    this.siteAdminRepository = siteAdminRepository;
  }

  async execute(email) {
    const normalizedEmail = normalizeSiteAdminEmail(email);

    await this.siteAdminRepository.delete(normalizedEmail);

    return normalizedEmail;
  }
}

module.exports = {
  RemoveSiteAdminEmail,
};
