export function normalizeSiteAdminEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();

  if (!email || !email.includes("@") || email.includes("/")) {
    throw new Error("A valid site-admin email is required.");
  }

  return email;
}
