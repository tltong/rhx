import { Student } from "../domain/student.js?v=20260823-student-country-v1";

export class CreateStudent {
  constructor({ studentRepository, findSyllabusScopeByCountry }) {
    this.studentRepository = studentRepository;
    this.findSyllabusScopeByCountry = findSyllabusScopeByCountry;
  }

  async execute(data) {
    const country = String(data?.country ?? "").trim();

    if (!country) {
      throw new Error("country is required.");
    }

    const syllabusScope = await this.findSyllabusScopeByCountry(country);

    if (!syllabusScope) {
      throw new Error("The selected country is not available.");
    }

    const student = new Student({
      ...data,
      country: syllabusScope.country
    });

    await this.studentRepository.save(student);

    return student;
  }
}
