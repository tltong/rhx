import {QUESTION_SEED_LEVELS, QUESTION_SEED_GRADES} from "../../../../config/firebase/question_seed_generator_schema.js?v=20261017-seed-association-order-v1";
import {normalizeAssociations} from "../../domain/question_seed_entry.js?v=20261017-seed-association-order-v1";

export function createAssociationPicker({root, prefix, associations = {}, onChange = () => {}}) {
  const values = normalizeAssociations(associations);
  const element = root.createElement("div");
  element.className = "association-picker";
  const fields = [];
  for (const level of Object.values(QUESTION_SEED_LEVELS)) {
    const fieldset = root.createElement("fieldset");
    const legend = root.createElement("legend");
    legend.textContent = level === QUESTION_SEED_LEVELS.PRIMARY ? "Primary grades" : "Secondary grades";
    const options = root.createElement("div");
    options.className = "grade-options";
    for (const grade of QUESTION_SEED_GRADES) {
      const label = root.createElement("label");
      const input = root.createElement("input");
      input.id = prefix + "-" + level + "-" + grade;
      input.type = "checkbox";
      input.checked = values[level]?.includes(grade) === true;
      input.value = String(grade);
      input.setAttribute("aria-label", legend.textContent.replace(" grades", " grade ") + grade);
      const text = root.createElement("span");
      text.textContent = String(grade);
      input.addEventListener("change", onChange);
      fields.push({level, grade, input});
      label.append(input, text);
      options.append(label);
    }
    fieldset.append(legend, options);
    element.append(fieldset);
  }
  return {
    element, fields,
    getValue() {
      return normalizeAssociations(Object.fromEntries(Object.values(QUESTION_SEED_LEVELS).map(level => [
        level, fields.filter(field => field.level === level && field.input.checked).map(field => field.grade),
      ])));
    },
    setValue(associations) {
      const values = normalizeAssociations(associations);
      fields.forEach(field => {field.input.checked = values[field.level]?.includes(field.grade) === true;});
    },
    setDisabled(disabled) {fields.forEach(field => {field.input.disabled = disabled;});},
    dispose() {fields.forEach(field => field.input.removeEventListener("change", onChange));},
  };
}
