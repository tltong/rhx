"""Check fill-in-the-blanks data boundaries against a local Firestore emulator."""
from base64 import urlsafe_b64encode
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import json
import os
import time

HOST = os.environ.get("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8093")
PROJECT = "demo-rhx-fill-blanks-rules"
assert HOST.split(":")[0] in ("127.0.0.1", "localhost"), "Use a local emulator."
BASE = f"http://{HOST}"
DOCUMENTS = f"/v1/projects/{PROJECT}/databases/(default)/documents/"

def request(method, path, data=None, uid="owner"):
    headers = {"Content-Type": "application/json"}
    if uid:
        def part(value):
            return urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
        now = int(time.time())
        token = "owner" if uid == "owner" else part({"alg": "none", "typ": "JWT"}) + "." + part({
            "iss": f"https://securetoken.google.com/{PROJECT}", "aud": PROJECT,
            "auth_time": now, "user_id": uid, "sub": uid, "iat": now, "exp": now + 3600,
            "email": uid + "@example.test", "email_verified": True,
            "firebase": {"identities": {}, "sign_in_provider": "custom"}}) + "."
        headers["Authorization"] = "Bearer " + token
    req = Request(BASE + path, headers=headers, method=method, data=None if data is None else json.dumps(data).encode())
    try:
        response = urlopen(req, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        body = response.read().decode()
        return response.status, json.loads(body) if body else {}

def write(path, fields, uid="owner"):
    return request("PATCH", DOCUMENTS + path, {"fields": {key: {"stringValue": value} for key, value in fields.items()}}, uid)

status, result = request("DELETE", f"/emulator/v1/projects/{PROJECT}/databases/(default)/documents")
assert status == 200, result
status, result = request("PUT", f"/emulator/v1/projects/{PROJECT}:securityRules", {"rules": {"files": [
    {"name": "firestore.rules", "content": (Path(__file__).resolve().parents[1] / "firestore.rules").read_text()}]}})
assert status == 200, result
assert write("siteAdmins/admin@example.test", {})[0] == 200
assert write("guardianStudentLinks/guardian__student", {"state": "active"})[0] == 200
passage = "fillInTheBlanksQuestions/syllabus/topics/topic/languages/english/passages/passage"
paths = {
    "passage": passage,
    "question": passage + "/questionItems/q1",
    "answerKey": passage + "/private/answerKey",
    "draft": "fillInTheBlanksDrafts/passage",
    "asset": "fillInTheBlanksPassageAssets/passage",
    "assignment": "studentFillInTheBlanksPractices/student/assignedPractices/practice",
    "submission": "studentFillInTheBlanksPractices/student/submissions/practice",
    "completion": "studentFillInTheBlanksPractices/student/completedPractices/practice",
    "processing": "studentFillInTheBlanksPractices/student/completionProcessing/practice",
    "generation": "studentFillInTheBlanksPracticeGenerations/student/completions/practice",
    "initial": "studentFillInTheBlanksPracticeGenerations/student/initials/practice",
    "usage": "userUsedFillInTheBlanksPassages/student/syllabuses/syllabus/topics/topic/passages/passage",
    "result": "fillInTheBlanksPracticeResults/practice/studentSubmissions/student",
    "config": "fillInTheBlanksQuestionGenerator/config",
    "markingConfig": "fillInTheBlanksScoring/config",
}
for path in paths.values():
    assert write(path, {"test": "server-owned"})[0] == 200
checks = 0
for name, path in paths.items():
    for uid in (None, "student", "guardian", "stranger", "admin"):
        expected_read = 200 if uid and (
            name in ("passage", "question", "config", "markingConfig")
            or name in ("answerKey", "draft") and uid == "admin"
            or name not in ("answerKey", "draft", "asset") and uid in ("student", "guardian", "admin")) else 403
        actual = request("GET", DOCUMENTS + path, uid=uid)
        assert actual[0] == expected_read, (name, uid, expected_read, actual)
        for method in ("PATCH", "DELETE"):
            actual = write(path, {"test": "forged"}, uid) if method == "PATCH" else request(method, DOCUMENTS + path, uid=uid)
            expected_write = 200 if uid == "admin" and method == "PATCH" and name in ("draft", "config", "markingConfig") else 403
            assert actual[0] == expected_write, (name, uid, method, actual)
        checks += 3
# Administrators create shared content via their feature repositories.
for suffix in ("", "/questionItems/q1", "/private/answerKey"):
    assert write(passage + "-admin-created" + suffix, {"format": "fillInTheBlanks"}, "admin")[0] == 200
    checks += 1

def commit_submission(practice_id, uid, fields, *, create=False):
    path = DOCUMENTS + "studentFillInTheBlanksPractices/student/submissions/" + practice_id
    transforms = [{"fieldPath": "requestedAt", "setToServerValue": "REQUEST_TIME"}]
    if create:
        transforms.append({"fieldPath": "submittedAt", "setToServerValue": "REQUEST_TIME"})
    update = {"update": {"name": path[4:], "fields": fields}, "updateTransforms": transforms}
    if not create:
        update["updateMask"] = {"fieldPaths": list(fields)}
    return request("POST", f"/v1/projects/{PROJECT}/databases/(default)/documents:commit", {"writes": [update]}, uid)

valid = {"answers": {"mapValue": {"fields": {"q1": {"stringValue": "dog"}}}},
    "timeTakenSeconds": {"doubleValue": 12}, "markingStatus": {"stringValue": "submitted"}, "requestId": {"stringValue": "first"}}
for practice_id in ("queued", "guardian-forgery", "stranger-forgery"):
    assert write("studentFillInTheBlanksPractices/student/assignedPractices/" + practice_id, {"passageId": "passage"})[0] == 200
assert commit_submission("queued", "student", valid, create=True)[0] == 200
assert commit_submission("guardian-forgery", "guardian", valid, create=True)[0] == 403
assert commit_submission("stranger-forgery", "stranger", valid, create=True)[0] == 403
assert commit_submission("no-assignment", "student", valid, create=True)[0] == 403
assert commit_submission("queued", "student", {"answers": valid["answers"]})[0] == 403
assert commit_submission("queued", "student", {"markingStatus": {"stringValue": "completed"}})[0] == 403
assert commit_submission("queued", "student", {"requestId": {"stringValue": "retry"}})[0] == 200
checks += 7
# Summary-history collection-group reads remain administrator-only.
query = {"structuredQuery": {"from": [{"collectionId": "passages", "allDescendants": True}],
    "where": {"fieldFilter": {"field": {"fieldPath": "format"}, "op": "EQUAL", "value": {"stringValue": "fillInTheBlanks"}}}}}
for uid, expected in (("admin", 200), ("student", 403)):
    response = request("POST", DOCUMENTS.rstrip("/") + ":runQuery", query, uid)
    assert response[0] == expected, (uid, response)
    checks += 1
assert write("subscriptions/student", {"applicationStatus": "suspended"})[0] == 200
for name in ("passage", "question", "assignment", "completion", "result"):
    assert request("GET", DOCUMENTS + paths[name], uid="student")[0] == 403, name
    checks += 1
assert request("GET", DOCUMENTS + paths["result"], uid="guardian")[0] == 200
checks += 1
print(f"Passed {checks} fill-in-the-blanks access-rule checks.")
