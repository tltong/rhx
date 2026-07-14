export class Student {
  constructor({
    id,
    email,
    name,
    username,
    level,
    yearOfBirth,
    yearOfRegistration,
    registrationDate,
    standardAtYearOfRegistration
  }) {
    this.id = id;
    this.email = email;
    this.name = name;
    this.username = username;
    this.level = level;
    this.yearOfBirth = yearOfBirth;
    this.yearOfRegistration = yearOfRegistration;
    this.registrationDate = registrationDate;
    this.standardAtYearOfRegistration =
      standardAtYearOfRegistration;
  }

  update({
    name,
    username,
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
