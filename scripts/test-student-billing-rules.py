"""Exercise the billing rules fragment against an isolated local Firestore emulator.

Run a Firestore emulator on 127.0.0.1:8987, then run this script. It installs a
proposed project ruleset from firestore.rules. No cloud request,
real account, payment, or production database is used.
"""
from base64 import urlsafe_b64encode
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import json
import os
import time

HOST = os.environ.get("RHX_FIRESTORE_RULES_TEST_HOST", "127.0.0.1:8987")
if HOST.split(":")[0] not in ("127.0.0.1", "localhost"):
    raise SystemExit("Rules tests only run against a local emulator.")
PROJECT = "demo-rhx-renewal-restart"
BASE = "http://" + HOST
DOCUMENTS = f"/v1/projects/{PROJECT}/databases/(default)/documents/"
ROOT = Path(__file__).resolve().parents[1]

def request(method, path, data=None, uid="owner"):
    headers = {"Content-Type": "application/json"}
    if uid is not None:
        if uid == "owner":
            token = "owner"  # Firestore emulator's admin token, never a real credential.
        else:
            def part(value):
                return urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
            now = int(time.time())
            token = part({"alg": "none", "typ": "JWT"}) + "." + part({
                "iss": f"https://securetoken.google.com/{PROJECT}", "aud": PROJECT,
                "auth_time": now, "user_id": uid, "sub": uid, "iat": now, "exp": now + 3600,
                "email": uid + "@example.test", "email_verified": True,
                "firebase": {"identities": {}, "sign_in_provider": "custom"}}) + "."
        headers["Authorization"] = "Bearer " + token
    req = Request(BASE + path, data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
    try:
        response = urlopen(req, timeout=15)
    except HTTPError as error:
        response = error
    with response:
        body = response.read().decode()
        return response.status, json.loads(body) if body else {}

def value(item):
    if isinstance(item, datetime):
        return {"timestampValue": item.isoformat().replace("+00:00", "Z")}
    if item is None:
        return {"nullValue": None}
    if isinstance(item, bool):
        return {"booleanValue": item}
    if isinstance(item, int):
        return {"integerValue": str(item)}
    if isinstance(item, dict):
        return {"mapValue": {"fields": {k: value(v) for k, v in item.items()}}}
    return {"stringValue": str(item)}

def write(path, data, uid="owner", query=""):
    return request("PATCH", DOCUMENTS + path + query, {"fields": {k: value(v) for k, v in data.items()}}, uid)

rules = (ROOT / "firestore.rules").read_text()
fragment = (ROOT / "functions/features/syllabus_subscription/firestore_student_billing.rules.inc").read_text()
assert fragment in rules, "Production and isolated billing helpers must agree."
status, result = request("PUT", f"/emulator/v1/projects/{PROJECT}:securityRules", {"rules": {"files": [{"name": "firestore.rules", "content": rules}]}})
if status != 200:
    raise SystemExit("Rules did not compile: " + json.dumps(result))

now = datetime.now(timezone.utc)
def seed(uid, *, state=None, expired=False, status="active"):
    sub = {"subscriptionType": "ongoing", "paymentProvider": "stripe", "paymentMode": "prod",
           "paymentSubscriptionReference": "sub_" + uid, "applicationStatus": status,
           "activeUntil": now + timedelta(hours=1)}
    if state:
        sub["activeUntil"] = now - timedelta(hours=1)
        sub["renewalRecovery"] = {"state": state, "paymentProvider": "stripe", "paymentMode": "prod",
            "paymentSubscriptionReference": "sub_" + uid,
            "graceUntil": now + timedelta(hours=-1 if expired else 1)}
        if state == "completed":
            sub["activeUntil"] = now + timedelta(days=30)
    assert write("subscriptions/" + uid, sub)[0] == 200
    assert write(f"studentPractices/{uid}/completedPractices/p", {"score": 1})[0] == 200
    return sub

seed("paid")
for uid, hours in [("collecting", 1), ("collection_expired", -1)]:
    sub = seed(uid)
    sub.update(activeUntil=now - timedelta(hours=1), renewalGraceUntil=now + timedelta(hours=hours))
    assert write("subscriptions/" + uid, sub)[0] == 200
seed("grace", state="held")
seed("expired", state="held", expired=True)
seed("suspended", status="suspended")
seed("pending", state="pending_reset", expired=True, status="suspended")
seed("recovered", state="completed", expired=True)
assert write("questions/q", {"text": "Emulator-only question"})[0] == 200
assert write("subscriptions/paid/invoices/server_invoice", {"invoiceReference": "in_test"})[0] == 200
assert write("stripeCustomers/prod/customers/cus_test", {"internalReference": "paid"})[0] == 200
assert write("siteAdmins/admin@example.test", {})[0] == 200
assert write("guardianStudentLinks/guardian__expired", {"guardianId": "guardian", "studentId": "expired", "state": "active"})[0] == 200
checks = []
def check(name, expected, operation):
    actual = operation()[0]
    if actual != expected:
        raise AssertionError(f"{name}: expected HTTP {expected}, got {actual}")
    checks.append(name)
    print(name + ": passed", flush=True)

assert write("subscriptions/paid/renewalEpisodes/private_episode", {"leaseToken": "private", "amount": 2500})[0] == 200
check("student cannot read private recovery state", 403,
      lambda: request("GET", DOCUMENTS + "subscriptions/paid/renewalEpisodes/private_episode", uid="paid"))
check("student cannot forge a recovery attempt", 403,
      lambda: write("subscriptions/paid/renewalEpisodes/private_episode", {"state": "completed"}, "paid"))
assert write("guardianStudentLinks/guardian__paid", {"guardianId": "guardian", "studentId": "paid", "state": "active"})[0] == 200
check("guardian cannot read private recovery state", 403,
      lambda: request("GET", DOCUMENTS + "subscriptions/paid/renewalEpisodes/private_episode", uid="guardian"))
check("guardian cannot reset the recovery retry counter", 403,
      lambda: write("subscriptions/paid/renewalEpisodes/private_episode", {"attemptsMade": 0}, "guardian"))

assert write("subscriptions/paid/paymentViews/private_view", {"defaultPaymentMethodReference": "pm_private"})[0] == 200
for uid in ["paid", "guardian"]:
    check(uid + " cannot directly read a private payment view", 403,
          lambda uid=uid: request("GET", DOCUMENTS + "subscriptions/paid/paymentViews/private_view", uid=uid))
    check(uid + " cannot forge a payment view", 403,
          lambda uid=uid: write("subscriptions/paid/paymentViews/private_view", {"paymentState": "paid"}, uid))

for uid, retained, paid in [("cancelled_paid", 1, 1), ("cancelled_expired", -1, -1), ("cancelled_grace", 1, -1)]:
    sub = seed(uid)
    sub.update(activeUntil=now + timedelta(hours=paid), renewalGraceUntil=now + timedelta(days=10),
      subscriptionCancellation={"state": "cancelled", "paymentProvider": "stripe", "paymentMode": "prod",
        "paymentSubscriptionReference": "sub_" + uid, "accessUntil": now + timedelta(hours=retained)})
    assert write("subscriptions/" + uid, sub)[0] == 200
    check(uid + " respects the cancellation access boundary", 200 if retained > 0 else 403,
      lambda uid=uid: request("GET", DOCUMENTS + f"studentPractices/{uid}/completedPractices/p", uid=uid))
check("cannot extend retained cancellation access", 403,
      lambda: write("subscriptions/cancelled_expired", {"subscriptionCancellation": {"accessUntil": now + timedelta(days=100)}}, "cancelled_expired",
                    "?updateMask.fieldPaths=subscriptionCancellation.accessUntil"))
assert write("subscriptions/paid/subscriptionCancellations/private_request", {"leaseToken": "private"})[0] == 200
check("student cannot read a private cancellation request", 403,
      lambda: request("GET", DOCUMENTS + "subscriptions/paid/subscriptionCancellations/private_request", uid="paid"))
check("guardian cannot read a private cancellation request", 403,
      lambda: request("GET", DOCUMENTS + "subscriptions/paid/subscriptionCancellations/private_request", uid="guardian"))
check("student cannot forge cancellation completion", 403,
      lambda: write("subscriptions/paid/subscriptionCancellations/private_request", {"state": "cancelled"}, "paid"))

for uid in ["paid", "grace", "recovered", "collecting"]:
    check(uid + " may read learning", 200, lambda uid=uid: request("GET", DOCUMENTS + f"studentPractices/{uid}/completedPractices/p", uid=uid))
    check(uid + " may submit learning", 200, lambda uid=uid: write(f"studentPractices/{uid}/completedPractices/new", {"score": 1}, uid))
for uid in ["expired", "suspended", "pending", "collection_expired"]:
    check(uid + " cannot read learning", 403, lambda uid=uid: request("GET", DOCUMENTS + f"studentPractices/{uid}/completedPractices/p", uid=uid))
    check(uid + " cannot submit learning", 403, lambda uid=uid: write(f"studentPractices/{uid}/completedPractices/new", {"score": 1}, uid))
    check(uid + " can still read billing status", 200, lambda uid=uid: request("GET", DOCUMENTS + "subscriptions/" + uid, uid=uid))
check("expired cannot bypass through shared questions or a missing student profile", 403,
      lambda: request("GET", DOCUMENTS + "questions/q", uid="expired"))
check("cannot unlock access by changing application status", 403,
      lambda: write("subscriptions/suspended", {"applicationStatus": "active"}, "suspended", "?updateMask.fieldPaths=applicationStatus"))
check("cannot extend the grace period", 403,
      lambda: write("subscriptions/expired", {"renewalRecovery": {"graceUntil": now + timedelta(days=100)}}, "expired",
                    "?updateMask.fieldPaths=renewalRecovery.graceUntil"))
check("cannot extend provisional collection grace", 403,
      lambda: write("subscriptions/collection_expired", {"renewalGraceUntil": now + timedelta(days=100)}, "collection_expired",
                    "?updateMask.fieldPaths=renewalGraceUntil"))
check("cannot delete the billing record to become unmanaged", 403,
      lambda: request("DELETE", DOCUMENTS + "subscriptions/expired", uid="expired"))
check("cannot access a sibling's learning", 403,
      lambda: request("GET", DOCUMENTS + "studentPractices/paid/completedPractices/p", uid="grace"))
check("anonymous learning access is denied", 403,
      lambda: request("GET", DOCUMENTS + "questions/q", uid=None))
check("cannot create an administrator identity", 403,
      lambda: write("siteAdmins/paid@example.test", {}, "paid"))
check("cannot forge provider registration", 403,
      lambda: write("stripeCustomers/prod/customers/cus_forged", {"internalReference": "paid"}, "paid"))
check("cannot forge an invoice settlement", 403,
      lambda: write("subscriptions/paid/invoices/server_invoice", {"paymentState": "paid"}, "paid"))
check("cannot forge a Stripe subscription on creation", 403,
      lambda: write("subscriptions/new_student", {"paymentProvider": "stripe", "subscriptionType": "ongoing"}, "new_student"))
check("new student can create a manual trial", 200,
      lambda: write("subscriptions/new_trial", {"subscriptionType": "trial", "applicationStatus": "active"}, "new_trial"))
check("suspended student cannot use another student's learning", 403,
      lambda: request("GET", DOCUMENTS + "studentPractices/paid/completedPractices/p", uid="expired"))
for collection in ["questions", "practices", "essayPractices", "essayResults"]:
    assert write(collection + "/guarded", {"example": True})[0] == 200
    check("suspended cannot read " + collection, 403,
          lambda collection=collection: request("GET", DOCUMENTS + collection + "/guarded", uid="expired"))
    check("anonymous cannot read " + collection, 403,
          lambda collection=collection: request("GET", DOCUMENTS + collection + "/guarded", uid=None))
check("guardian can still read suspended student's billing", 200,
      lambda: request("GET", DOCUMENTS + "subscriptions/expired", uid="guardian"))
check("guardian can still read suspended student's report", 200,
      lambda: request("GET", DOCUMENTS + "studentPractices/expired/completedPractices/p", uid="guardian"))
check("administrator can read suspended student's report", 200,
      lambda: request("GET", DOCUMENTS + "studentPractices/expired/completedPractices/p", uid="admin"))
check("administrator cannot rewrite Stripe entitlement", 403,
      lambda: write("subscriptions/expired", {"activeUntil": now + timedelta(days=100)}, "admin", "?updateMask.fieldPaths=activeUntil"))
check("administrator cannot delete Stripe entitlement", 403,
      lambda: request("DELETE", DOCUMENTS + "subscriptions/expired", uid="admin"))
check("student cannot edit payment retry configuration", 403,
      lambda: write("paymentConfigs/default", {"mode": "test"}, "paid"))
check("administrator can edit payment retry configuration", 200,
      lambda: write("paymentConfigs/default", {"mode": "test"}, "admin"))
check("administrator can manage a manual subscription", 200,
      lambda: write("subscriptions/manual_student", {"subscriptionType": "ongoing", "activeUntil": now + timedelta(days=10)}, "admin"))
assert write("subscriptions/paid/checkouts/stripe_prod", {"internalReference": "guardian", "planId": "monthly"})[0] == 200
check("student cannot read private checkout reservations", 403,
      lambda: request("GET", DOCUMENTS + "subscriptions/paid/checkouts/stripe_prod", uid="paid"))
check("student cannot forge checkout reservations", 403,
      lambda: write("subscriptions/paid/checkouts/stripe_prod", {"subscriptionReference": "sub_forged"}, "paid"))
check("guardian cannot forge checkout reservations", 403,
      lambda: write("subscriptions/expired/checkouts/stripe_prod", {"subscriptionReference": "sub_forged"}, "guardian"))
print(f"{len(checks)} emulator security checks passed.", flush=True)
