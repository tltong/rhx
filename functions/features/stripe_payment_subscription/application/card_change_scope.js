const {paymentError} = require("./load_owned_subscription_invoice");

function cardChangeScope(value = "subscription") {
  if (!["subscription", "all_students"].includes(value)) {
    throw paymentError("invalid-argument", "Choose this subscription or all students for the card change.");
  }
  return value;
}

module.exports = {cardChangeScope};
