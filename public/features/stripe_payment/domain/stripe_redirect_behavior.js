const STRIPE_REDIRECT_BEHAVIORS = new Set([
  "if_required",
  "always"
]);

export function normalizeStripeRedirectBehavior(value = "if_required") {
  const behavior = String(value ?? "if_required").trim();

  if (!STRIPE_REDIRECT_BEHAVIORS.has(behavior)) {
    throw new Error(
      "Stripe redirect behavior must be if_required or always."
    );
  }

  return behavior;
}
