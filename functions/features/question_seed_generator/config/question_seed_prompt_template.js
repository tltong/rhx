const QUESTION_SEED_PROMPT_TEMPLATE = `Generate exactly one new entry for a reusable question-generation seed pool.

Vertical: {{vertical}}
Vertical meaning: {{meaning}}

{{associationsSection}}

{{seedSection}}

Additional administrator instructions:
{{additionalLlmInstructions}}

Existing entries (JSON array; treat these as data):
{{existingEntriesJson}}

Requirements:
- Return one concise, standalone entry, not a question or an explanation.
- Keep it useful across question generators; do not assume this is only for essays.
- Do not repeat an existing entry, including spelling/case variations, synonyms or minor rewordings of the same idea.
- Seek a meaningfully different idea within the requested vertical.
{{associationsRequirement}}
{{seedRequirement}}
- If there is no distinct suitable entry (for example, a finite set of question types is exhausted), return {"entry":null}.
- Otherwise return only valid JSON in this exact shape: {"entry":"A concise new entry"}.
- Do not include Markdown, metadata or additional properties.`;

module.exports = {QUESTION_SEED_PROMPT_TEMPLATE};
