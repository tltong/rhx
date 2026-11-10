export class Student {
  constructor({
    id,
    email,
    name,
    username,
    country,
    level,
    yearOfBirth,
    yearOfRegistration,
    registrationDate,
    standardAtYearOfRegistration,
    schoolId = null, profileVersion = 0, academicReferenceYear, gradeAtReferenceYear
  }) {
    this.id = id;
    this.email = email;
    this.name = name;
    this.username = username;
    this.country = country;
    this.level = level;
    this.yearOfBirth = yearOfBirth;
    this.yearOfRegistration = yearOfRegistration;
    this.registrationDate = registrationDate;
    this.standardAtYearOfRegistration =
      standardAtYearOfRegistration;
    Object.assign(this, {schoolId, profileVersion, academicReferenceYear, gradeAtReferenceYear});
  }

  update({
    name,
    username,
    country,
    level,
    yearOfBirth,
    standardAtYearOfRegistration
  }) {
    if (name !== undefined) {
      this.name = name;
    }

    if (username !== undefined) {
      this.username = username;
    }

    if (country !== undefined) {
      this.country = country;
    }

    if (level !== undefined) {
      this.level = level;
    }

    if (yearOfBirth !== undefined) {
      this.yearOfBirth = yearOfBirth;
    }

    if (standardAtYearOfRegistration !== undefined) {
      this.standardAtYearOfRegistration =
        standardAtYearOfRegistration;
    }

    return this;
  }
}
