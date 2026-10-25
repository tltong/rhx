// Generation preconditions model the GCS contract used by the production repository.
class MemoryJobRepository {
  constructor() {this.objects = new Map(); this.generation = 0; this.onCreate = () => {};}
  async read(key, generation) {
    const record = this.objects.get(key);
    return record && (!generation || String(generation) === record.generation) ? structuredClone(record) : null;
  }
  async write(key, value, generation = 0) {
    const previous = this.objects.get(key);
    if (String(generation) !== (previous?.generation || "0")) return false;
    const record = {value: structuredClone(value), generation: String(++this.generation)};
    this.objects.set(key, record);
    if (!previous) this.onCreate({name: key, generation: record.generation});
    return true;
  }
  async remove(key, generation) {
    const previous = this.objects.get(key);
    if (previous && generation && String(generation) !== previous.generation) throw new Error("Generation changed.");
    this.objects.delete(key);
  }
}
module.exports = {MemoryJobRepository};
