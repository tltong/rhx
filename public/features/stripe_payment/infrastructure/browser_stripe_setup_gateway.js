import {
  disposeStripeSetupContext,
  readStripeSetupContext,
  StripeSetupContext
} from "../domain/stripe_setup_context.js?v=20260907-stripe-setup-context-v1";
import {
  normalizeStripeSetupContextReference
} from "../domain/stripe_payment_references.js?v=20260907-stripe-setup-context-v1";

let fallbackContextSequence = 0;

function createStripeError(error, fallbackMessage) {
  const stripeError = new Error(
    String(error?.message ?? "").trim() || fallbackMessage
  );

  stripeError.code = error?.code || null;
  stripeError.type = error?.type || null;
  return stripeError;
}

function defaultContextReferenceFactory() {
  const uuid = globalThis.crypto?.randomUUID?.();

  if (uuid) {
    return `stripe_setup_context_${uuid}`;
  }

  fallbackContextSequence += 1;
  return (
    `stripe_setup_context_${Date.now().toString(36)}_` +
    fallbackContextSequence.toString(36)
  );
}

function isTerminalSetupIntent(setupIntent) {
  return setupIntent?.status === "succeeded"
    || setupIntent?.status === "canceled";
}

export class BrowserStripeSetupGateway {
  constructor({
    stripeFactory = null,
    contextReferenceFactory = defaultContextReferenceFactory
  } = {}) {
    this.stripeFactory = stripeFactory;
    this.contextReferenceFactory = contextReferenceFactory;
    this.setupContexts = new Map();
  }

  getStripeFactory() {
    const stripeFactory = this.stripeFactory || globalThis.Stripe;

    if (typeof stripeFactory !== "function") {
      throw new Error(
        "Stripe.js is not available. Load https://js.stripe.com/v3/ first."
      );
    }

    return stripeFactory;
  }

  createContextReference() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const reference = normalizeStripeSetupContextReference(
        this.contextReferenceFactory()
      );

      if (!this.setupContexts.has(reference)) {
        return reference;
      }
    }

    throw new Error("Could not create a unique Stripe setup context.");
  }

  requireContext(contextReference) {
    const reference = normalizeStripeSetupContextReference(contextReference);
    const context = this.setupContexts.get(reference);

    if (!context) {
      throw new Error("Stripe setup context was not found or has expired.");
    }

    return context;
  }

  releaseContext(context) {
    this.setupContexts.delete(context.contextReference);
    disposeStripeSetupContext(context);
  }

  async mountPaymentElement({
    publishableKey,
    clientSecret,
    containerSelector,
    mode
  }) {
    const stripe = this.getStripeFactory()(publishableKey);

    if (!stripe || typeof stripe.elements !== "function") {
      throw new Error("Stripe.js could not be initialized.");
    }

    const elements = stripe.elements({clientSecret});

    if (!elements || typeof elements.create !== "function") {
      throw new Error("Stripe Elements could not be initialized.");
    }

    const paymentElement = elements.create("payment");

    if (!paymentElement || typeof paymentElement.mount !== "function") {
      throw new Error("Stripe Payment Element could not be created.");
    }

    paymentElement.mount(containerSelector);

    const contextReference = this.createContextReference();
    const context = new StripeSetupContext({
      contextReference,
      stripe,
      elements,
      paymentElement,
      clientSecret,
      mode
    });

    this.setupContexts.set(contextReference, context);
    return contextReference;
  }

  async retrieveSetupIntent({publishableKey, clientSecret}) {
    const stripe = this.getStripeFactory()(publishableKey);

    if (!stripe || typeof stripe.retrieveSetupIntent !== "function") {
      throw new Error("Stripe.js cannot retrieve SetupIntents.");
    }

    const result = await stripe.retrieveSetupIntent(clientSecret);

    if (result?.error) {
      throw createStripeError(
        result.error,
        "Stripe could not retrieve the SetupIntent."
      );
    }

    return result?.setupIntent || null;
  }

  async confirmSetup({contextReference, returnUrl}) {
    const context = this.requireContext(contextReference);
    const {
      stripe,
      elements,
      clientSecret
    } = readStripeSetupContext(context);

    if (typeof elements.submit === "function") {
      const submission = await elements.submit();

      if (submission?.error) {
        throw createStripeError(
          submission.error,
          "Stripe could not validate the payment details."
        );
      }
    }

    if (typeof stripe.confirmSetup !== "function") {
      throw new Error("Stripe.js cannot confirm SetupIntents.");
    }

    const result = await stripe.confirmSetup({
      elements,
      clientSecret,
      confirmParams: {
        return_url: returnUrl
      },
      redirect: "if_required"
    });

    if (result?.error) {
      throw createStripeError(
        result.error,
        "Stripe could not confirm the payment method."
      );
    }

    const setupIntent = result?.setupIntent || null;

    if (isTerminalSetupIntent(setupIntent)) {
      this.releaseContext(context);
    }

    return setupIntent;
  }
}