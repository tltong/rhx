import {onFirebaseAuthStateChanged, getFirebaseAuth} from "../../../../utils/firebase/firebase_auth.js";
import {watchStudentSubscriptionAccess} from "../../../syllabus_subscription/student_access_module.js?v=20261031-subscription-cancel-v1";
let unsubscribe = () => {};
const heading = document.querySelector("#access-heading"), description = document.querySelector("#access-description");
onFirebaseAuthStateChanged(user => {
  unsubscribe();
  if (!user) {location.replace("../sign_in/sign_in.html"); return;}
  unsubscribe = watchStudentSubscriptionAccess(user.uid, access => {
    if (access.allowed) {location.replace("../landing/landing.html"); return;}
    heading.textContent = "Subscription access suspended";
    description.textContent = access.reason === "payment_required"
      ? "A current paid subscription period could not be confirmed. Ask your guardian to check the subscription payment status."
      : "The renewal payment is unresolved and the grace period has ended. Ask your guardian to complete payment. Access returns after the payment and new subscription cycle are confirmed.";
  }, () => {
    heading.textContent = "Could not check subscription access";
    description.textContent = "The service could not be reached. Check your connection and try again.";
  });
});
document.querySelector("#check-access").addEventListener("click", () => location.reload());
document.querySelector("#sign-out").addEventListener("click", () => getFirebaseAuth().signOut());
addEventListener("pagehide", () => unsubscribe(), {once: true});
