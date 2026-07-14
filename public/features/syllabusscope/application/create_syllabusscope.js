import { SyllabusScope } from "../domain/syllabusscope.js";

export class CreateSyllabusScope {
  constructor(syllabusScopeRepository) {
    this.syllabusScopeRepository = syllabusScopeRepository;
  }

  async execute(data) {
    const syllabusScope = new SyllabusScope(data);

    await this.syllabusScopeRepository.save(syllabusScope);

    return syllabusScope;
  }
}
