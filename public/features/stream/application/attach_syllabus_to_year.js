import {
  requireAvailableYear,
  requireScope,
  syllabusMatchesScope
} from "./stream_scope.js?v=20260823-stream-language-v1";

function requireSyllabusLanguage(syllabus, language) {
  const selectedLanguage = String(language ?? "").trim();

  if (!selectedLanguage) {
    throw new Error("language is required.");
  }

  const languageMatch = (syllabus.languages || []).find((item) => (
    String(item).trim().localeCompare(selectedLanguage, undefined, {
      sensitivity: "accent"
    }) === 0
  ));

  if (!languageMatch) {
    throw new Error(
      "The selected language is not available for this syllabus."
    );
  }

  return String(languageMatch).trim();
}

export class AttachSyllabusToYear {
  constructor({
    streamRepository,
    findSyllabusScopeByCountry,
    getSyllabusById,
    now = () => new Date()
  }) {
    this.streamRepository = streamRepository;
    this.findSyllabusScopeByCountry = findSyllabusScopeByCountry;
    this.getSyllabusById = getSyllabusById;
    this.now = now;
  }

  async execute({ streamId, year, syllabusId, language }) {
    const stream = await this.streamRepository.getById(streamId);

    if (!stream) {
      throw new Error("Stream could not be found.");
    }

    const scope = requireScope(
      await this.findSyllabusScopeByCountry(stream.country),
      stream.country
    );
    const selectedYear = requireAvailableYear(scope, stream.level, year);
    const syllabus = await this.getSyllabusById(syllabusId);

    if (!syllabus) {
      throw new Error("Syllabus could not be found.");
    }

    if (!syllabusMatchesScope(syllabus, {
      country: stream.country,
      level: stream.level
    })) {
      throw new Error(
        "The syllabus country and level must match the stream."
      );
    }

    const selectedLanguage = requireSyllabusLanguage(syllabus, language);
    const assignment = stream.attachSyllabus(
      selectedYear,
      syllabus.id,
      selectedLanguage,
      this.now()
    );

    await this.streamRepository.saveYearAssignment(stream.id, assignment);
    await this.streamRepository.save(stream);

    return assignment;
  }
}
