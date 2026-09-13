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

  async confirmPayment({publishableKey, clientSecret, returnUrl}) {
    const stripe = this.getStripeFactory()(publishableKey);

    if (!stripe || typeof stripe.confirmPayment !== "function") {
      throw new Error("Stripe.js cannot confirm PaymentIntents.");
    }

    const result = await stripe.confirmPayment({
      clientSecret,
      confirmParams: {
        return_url: returnUrl
      },
      redirect: "if_required"
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
