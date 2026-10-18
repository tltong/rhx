export function fillFrameworkSelect(select, frameworks, selectedId = "", {documentRef = document, placeholder = "Use syllabus default"} = {}) {
  select.replaceChildren();
  const defaultOption = documentRef.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = placeholder;
  select.append(defaultOption);
  for (const type of ["normal", "essay"]) {
    const group = documentRef.createElement("optgroup");
    group.label = type === "essay" ? "Essay" : "Normal";
    for (const framework of frameworks.filter(item => (item.frameworkType || "normal") === type)) {
      const option = documentRef.createElement("option");
      option.value = framework.id; option.textContent = framework.name;
      group.append(option);
    }
    if (group.children.length) select.append(group);
  }
  if (selectedId && !frameworks.some(item => item.id === selectedId)) {
    const missing = documentRef.createElement("option");
    missing.value = selectedId; missing.textContent = "Unavailable framework: " + selectedId;
    select.append(missing);
  }
  select.value = selectedId;
}
