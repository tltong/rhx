// Internal server-only reservation. Billing children are never client writable.
const {FirestoreStudentCheckoutRepository} = require("./infrastructure/firestore_student_checkout_repository");
const repository = new FirestoreStudentCheckoutRepository();
module.exports = {
  getStudentSubscriptionCheckout: input => repository.get(input),
  claimStudentSubscriptionCheckout: input => repository.claim(input),
  completeStudentSubscriptionCheckout: input => repository.complete(input),
};
