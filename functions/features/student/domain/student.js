class Student {
  constructor({
    id,
    email,
    name,
    username,
    pin,
    country,
    level,
    yearOfBirth,
    yearOfRegistration,
    registrationDate,
    standardAtYearOfRegistration,
  }) {
    this.id = id;
    this.email = email;
    this.name = name;
    this.username = username;
    this.pin = pin;
    this.country = country;
    this.level = level;
    this.yearOfBirth = yearOfBirth;
    this.yearOfRegistration = yearOfRegistration;
    this.registrationDate = registrationDate;
    this.standardAtYearOfRegistration = standardAtYearOfRegistration;
  }
}

module.exports = {
  Student,
};
