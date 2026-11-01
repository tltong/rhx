function createStripeError(error, fallbackMessage) {
  const stripeError = new Error(
    String(error?.message ?? "").trim() || fallbackMessage
  );

  stripeError.code = error?.code || null;
  stripeError.type = error?.type || null;
  return stripeError;
}

export class BrowserStripePaymentConfirmationGateway {
  constructor({stripeFactory = null} = {}) {
    this.stripeFactory = stripeFactory;
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

  async confirmPayment({
    publishableKey,
    clientSecret,
    returnUrl,
    redirectBehavior = "if_required",
    authenticationOnly = false,
    useSavedCard = false
  }) {
    const stripe = this.getStripeFactory()(publishableKey);

    if (authenticationOnly && useSavedCard) throw Error("Choose either authentication or saved-card confirmation.");
    const method = authenticationOnly ? "handleNextAction" : useSavedCard ? "confirmCardPayment" : "confirmPayment";
    if (!stripe || typeof stripe[method] !== "function") {
      throw new Error("Stripe.js cannot confirm PaymentIntents.");
    }

    // An already-confirmed payment only needs its next action. Initial
    // saved-card payments need confirmation without mounting card-entry UI.
    const result = authenticationOnly ? await stripe.handleNextAction({clientSecret})
      : useSavedCard ? await stripe.confirmCardPayment(clientSecret, {return_url: returnUrl})
      : await stripe.confirmPayment({
      clientSecret,
      confirmParams: {
        return_url: returnUrl
      },
      redirect: redirectBehavior
    });

    if (result?.error) {
      throw createStripeError(
        result.error,
        "Stripe could not confirm the subscription payment."
      );
    }

    return result?.paymentIntent || null;
  }
}
