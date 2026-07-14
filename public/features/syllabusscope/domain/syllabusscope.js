export class SyllabusScope {
  constructor({
    id,
    country,
    levels = {}
  }) {
    this.id = id;
    this.country = country;
    this.levels = levels;
  }

  update({
    country,
    levels
  }) {
    if (country !== undefined) {
      this.country = country;
    }

    if (levels !== undefined) {
      this.levels = levels;
    }

    return this;
  }
}
