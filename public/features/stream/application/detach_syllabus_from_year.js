export class DetachSyllabusFromYear {
  constructor({
    streamRepository,
    now = () => new Date()
  }) {
    this.streamRepository = streamRepository;
    this.now = now;
  }

  async execute({ streamId, year, syllabusId }) {
    const stream = await this.streamRepository.getById(streamId);

    if (!stream) {
      throw new Error("Stream could not be found.");
    }

    const currentAssignment = stream.getYearAssignment(year);

    if (!currentAssignment) {
      return null;
    }

    if (!currentAssignment.syllabusIds.includes(String(syllabusId).trim())) {
      return currentAssignment;
    }

    const assignment = stream.detachSyllabus(
      year,
      syllabusId,
      this.now()
    );

    if (assignment) {
      await this.streamRepository.saveYearAssignment(stream.id, assignment);
    } else {
      await this.streamRepository.deleteYearAssignment(stream.id, year);
    }

    await this.streamRepository.save(stream);

    return assignment;
  }
}
