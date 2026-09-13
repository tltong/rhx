const {
  StripeCustomerRecord,
  StripePaymentMethodRecord,
  StripeSetupIntentRecord,
  StripeSubscriptionRecord,
} = require("../domain/stripe_customer_records");

class ManageStripeCustomerRecords {
  constructor({
    stripeCustomerRepository,
    now = () => new Date(),
  }) {
    this.stripeCustomerRepository = stripeCustomerRepository;
    this.now = now;
  }

  async createCustomerRecord(input) {
    const timestamp = this.now();
    const record = new StripeCustomerRecord({
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return this.stripeCustomerRepository.createCustomer(record);
  }

  async getCustomerRecordByReference(input) {
    return this.stripeCustomerRepository.getCustomerByReference(
      input?.mode,
      input?.customerReference,
    );
  }

  async getCustomerRecordByInternalReference(input) {
    return this.stripeCustomerRepository.getCustomerByInternalReference(
      input?.mode,
      input?.internalReference,
    );
  }

  async updateCustomerRecord(input) {
    const existing = await this.getCustomerRecordByReference(input);

    if (!existing) {
      throw new Error("Stripe customer record could not be found.");
    }

    const previousInternalReference = existing.internalReference;
    existing.update(
      {
        internalReference: input?.changes?.internalReference,
        email: input?.changes?.email,
      },
      this.now(),
    );

    return this.stripeCustomerRepository.updateCustomer(
      existing,
      previousInternalReference,
    );
  }

  async replaceCustomerRecord(input) {
    const timestamp = this.now();
    const record = new StripeCustomerRecord({
      mode: input?.mode,
      customerReference: input?.customerReference,
      internalReference: input?.internalReference,
      email: input?.email,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return this.stripeCustomerRepository.replaceCustomer(
      input?.staleCustomerReference,
      record,
    );
  }

  async deleteCustomerRecord(input) {
    await this.stripeCustomerRepository.deleteCustomer(
      input?.mode,
      input?.customerReference,
    );
  }

  async writeSetupIntentRecord(input) {
    const existing = await this.getSetupIntentRecord(input);
    const timestamp = this.now();
    const record = new StripeSetupIntentRecord({
      ...input,
      createdAt: existing?.createdAt ?? input?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });

    return this.stripeCustomerRepository.writeSetupIntent(record);
  }

  async getSetupIntentRecord(input) {
    return this.stripeCustomerRepository.getSetupIntent(input);
  }

  async listSetupIntentRecords(input) {
    return this.stripeCustomerRepository.listSetupIntents(input);
  }

  async deleteSetupIntentRecord(input) {
    await this.stripeCustomerRepository.deleteSetupIntent(input);
  }

  async writePaymentMethodRecord(input) {
    const existing = await this.getPaymentMethodRecord(input);
    const timestamp = this.now();
    const record = new StripePaymentMethodRecord({
      ...input,
      createdAt: existing?.createdAt ?? input?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });

    return this.stripeCustomerRepository.writePaymentMethod(record);
  }

  async getPaymentMethodRecord(input) {
    return this.stripeCustomerRepository.getPaymentMethod(input);
  }

  async listPaymentMethodRecords(input) {
    return this.stripeCustomerRepository.listPaymentMethods(input);
  }

  async deletePaymentMethodRecord(input) {
    await this.stripeCustomerRepository.deletePaymentMethod(input);
  }

  async writeSubscriptionRecord(input) {
    const existing = await this.getSubscriptionRecord(input);
    const timestamp = this.now();
    const record = new StripeSubscriptionRecord({
      ...input,
      createdAt: existing?.createdAt ?? input?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });

    return this.stripeCustomerRepository.writeSubscription(record);
  }

  async getSubscriptionRecord(input) {
    return this.stripeCustomerRepository.getSubscription(input);
  }

  async listSubscriptionRecords(input) {
    return this.stripeCustomerRepository.listSubscriptions(input);
  }

  async deleteSubscriptionRecord(input) {
    await this.stripeCustomerRepository.deleteSubscription(input);
  }
}

module.exports = {
  ManageStripeCustomerRecords,
};
