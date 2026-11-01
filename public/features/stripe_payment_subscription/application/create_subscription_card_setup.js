import {normalizeCardChangeScope, normalizeCardTargets} from "./manage_subscription_payment.js?v=20261101-stored-status-v1";
import {normalizeSubscriptionReference}
  from "./get_subscription_payment_action.js?v=20261101-stored-status-v1";

export class CreateStripeSubscriptionCardSetup {
  constructor(gateway) {this.gateway = gateway;}

  async execute(input = {}) {
    const subscriptionReference = normalizeSubscriptionReference(input.subscriptionReference);
    const attempt = input.idempotencyReference;
    if (typeof attempt !== "string" || !attempt.trim() || attempt.length > 500) {
      throw new Error("A valid idempotencyReference is required.");
    }
    const result = await this.gateway.createSubscriptionCardSetup({
      subscriptionReference, idempotencyReference: attempt.trim(),
      ...(input.cardChangeScope === undefined ? {} : {cardChangeScope: normalizeCardChangeScope(input.cardChangeScope)})
    });
    if (!/^seti_[a-zA-Z0-9_]+$/.test(result?.setupIntentReference || "")
      || typeof result?.clientSecret !== "string" || !result.clientSecret.trim()) {
      throw new Error("Invalid subscription card setup response.");
    }
    const targets = input.cardChangeScope === "all_students" ? normalizeCardTargets(result.cardChangeTargets) : null;
    if (targets && (!targets.length || !targets.some(t => t.subscriptionReference === subscriptionReference))) {
      throw new Error("Card setup did not confirm the selected student subscriptions.");
    }
    return Object.freeze({setupIntentReference: result.setupIntentReference,
      clientSecret: result.clientSecret.trim(), ...(targets ? {cardChangeTargets: targets} : {})});
  }
}
