const stripeSetupContextState = new WeakMap();

function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }

  return text;
}

function requireObject(value, fieldName) {
  if (!value || typeof value !== "object") {
    throw new Error(`${fieldName} is required.`);
  }

  return value;
}

export class StripeSetupContext {
  constructor({
    contextReference,
    stripe,
    elements,
    paymentElement,
    clientSecret,
    mode
  }) {
    this.contextReference = requireText(
      contextReference,
      "Stripe setup context reference"
    );
    this.mode = requireText(mode, "Stripe payment mode");

    stripeSetupContextState.set(this, {
      stripe: requireObject(stripe, "Stripe.js instance"),
      elements: requireObject(elements, "Stripe Elements instance"),
      paymentElement: requireObject(
        paymentElement,
        "Stripe Payment Element"
      ),
      clientSecret: requireText(clientSecret, "Stripe client secret")
    });

    Object.freeze(this);
  }
}

export function readStripeSetupContext(context) {
  if (!(context instanceof StripeSetupContext)) {
    throw new Error("Stripe setup context is invalid or has expired.");
  }

  const state = stripeSetupContextState.get(context);

  if (!state) {
    throw new Error("Stripe setup context is invalid or has expired.");
  }

  return state;
}

export function disposeStripeSetupContext(context) {
  const state = stripeSetupContextState.get(context);

  if (!state) {
    return;
  }

  state.paymentElement?.unmount?.();
  stripeSetupContextState.delete(context);
}
