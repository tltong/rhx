class Student {
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
    schoolId = null, profileVersion = 0, academicReferenceYear, gradeAtReferenceYear,
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
    this.standardAtYearOfRegistration = standardAtYearOfRegistration;
    Object.assign(this, {schoolId, profileVersion, academicReferenceYear, gradeAtReferenceYear});
  }
}

module.exports = {
  Student,
};
