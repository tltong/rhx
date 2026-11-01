/**
 * Run with the deployment service account's Application Default Credentials.
 * Dry run: node scripts/backfill-subscription-payment-views.js
 * Enqueue: node scripts/backfill-subscription-payment-views.js --apply
 * No Stripe requests, charges or subscription creation. The existing protected
 * renewal worker populates each missing view using its recorded payment mode.
 */
async function backfill({db, repository, apply = false}) {
  const result = {registered: 0, existing: 0, missing: 0, queued: 0};
  for (const mode of ["test", "prod"]) {
    const customers = await db.collection(`stripeCustomers/${mode}/customers`).get();
    for (const customerDoc of customers.docs) {
      const customer = customerDoc.data();
      if (!customer.internalReference) continue;
      const records = await customerDoc.ref.collection("subscriptions").get();
      for (const doc of records.docs) {
        const record = doc.data();
        if (!record.studentId || !/^sub_[\w]+$/.test(doc.id)) continue;
        result.registered++;
        const scope = {mode, studentId: record.studentId, subscriptionReference: doc.id,
          customerReference: customerDoc.id, guardianId: customer.internalReference};
        if (await repository.get(scope)) {result.existing++; continue;}
        result.missing++;
        if (apply) {await repository.request(scope, "backfill"); result.queued++;}
      }
    }
  }
  return result;
}
module.exports = {backfill};
if (require.main === module) {
  const {getFirestoreDb} = require("../functions/utils/firebase/firebase_ops");
  const {FirestoreSubscriptionPaymentViewRepository} = require("../functions/features/syllabus_subscription/infrastructure/firestore_subscription_payment_view_repository");
  backfill({db: getFirestoreDb(), repository: new FirestoreSubscriptionPaymentViewRepository(),
    apply: process.argv.includes("--apply")}).then(result => console.log(JSON.stringify(result)))
    .catch(error => {console.error("Subscription view backfill failed:", error.code || "unavailable"); process.exitCode = 1;});
}
