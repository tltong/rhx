import {
  requireAvailableYear,
  requireScope,
  syllabusMatchesScope
} from "./stream_scope.js?v=20260823-stream-all-syllabuses-v2";

export class ListEligibleSyllabuses {
  constructor({
    findSyllabusScopeByCountry,
    listSyllabuses
  }) {
    this.findSyllabusScopeByCountry = findSyllabusScopeByCountry;
    this.listSyllabuses = listSyllabuses;
  }

  async execute({ country, level, year }) {
    const scope = requireScope(
      await this.findSyllabusScopeByCountry(country),
      country
    );
    requireAvailableYear(scope, level, year);
    const syllabuses = await this.listSyllabuses();

    return syllabuses
      .filter((syllabus) => syllabusMatchesScope(syllabus, {
        country: scope.country,
        level
      }))
      .map((syllabus) => ({
        id: syllabus.id,
        year: syllabus.year,
        subject: syllabus.subject,
        languages: [...(syllabus.languages || [])],
        active: syllabus.active === true
      }))
      .sort((first, second) => (
        Number(first.year) - Number(second.year)
        || first.subject.localeCompare(second.subject)
        || first.id.localeCompare(second.id)
      ));
  }
}
