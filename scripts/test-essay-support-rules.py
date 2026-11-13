"""Verify immutable shared essay content and server-owned image records locally.

Start the local Firestore emulator on port 8987, then run this script.
It also runs the existing billing rule regression checks. No cloud requests.
"""
from pathlib import Path
import runpy

suite = runpy.run_path(str(Path(__file__).with_name("test-student-billing-rules.py")))
write, request, documents = suite["write"], suite["request"], suite["DOCUMENTS"]
checks = 0

def expect(actual, status):
    global checks
    assert actual[0] == status, actual
    checks += 1

expect(write("siteAdmins/essayadmin@example.test", {}, "owner"), 200)
question = "essayQuestionGenerator/primary/standards/2/languages/Tamil/questions/essay-picture-test"
expect(write("essayQuestionGenerator/config", {"gradeSupport": {}}, "essayadmin"), 200)
expect(write("essayQuestionGenerator/config", {"gradeSupport": {}}, "student-essay"), 403)
expect(request("GET", documents + "essayQuestionGenerator/config", uid="student-essay"), 200)
# The shared question rules allow creation only. Remove prior test fixtures on reruns.
request("DELETE", documents + question, uid="owner")
request("DELETE", documents + "essayQuestionGenerator/questionIndex/entries/essay-picture-test", uid="owner")
write("essayConfig/poolMaintenance", {"active": False}, "owner")
expect(write(question, {"questionText": "Write about a park."}, "essayadmin"), 200)
expect(request("GET", documents + question, uid="student-essay"), 200)
expect(request("GET", documents + question, uid=None), 403)
expect(write(question, {"questionText": "Changed after assignment"}, "essayadmin"), 403)
expect(write(question, {"questionText": "Student edit"}, "student-essay"), 403)
expect(request("DELETE", documents + question, uid="essayadmin"), 403)
expect(write("essayQuestionGenerator/questionIndex/entries/essay-picture-test", {"documentPath": question}, "essayadmin"), 200)
expect(write("essayQuestionGenerator/questionIndex/entries/essay-picture-test", {"documentPath": "other"}, "essayadmin"), 403)
expect(write("essayQuestionAssets/essay-picture-test", {"state": "ready"}, "owner"), 200)
for uid in ("student-essay", "essayadmin", None):
    expect(request("GET", documents + "essayQuestionAssets/essay-picture-test", uid=uid), 403)
    expect(write("essayQuestionAssets/essay-picture-test", {"state": "ready"}, uid), 403)
print(f"Passed {checks} essay support access-rule checks.")

# Shared configuration is readable when signed in; all catalog/reference writes use the verified backend.
for path in ("essayTypes/custom-type", "essayGradeConfigs/primary_3", "essayConfig/settings"):
    expect(write(path, {"name": "Example"}, "owner"), 200)
    expect(request("GET", documents + path, uid="student-essay"), 200)
    expect(request("GET", documents + path, uid=None), 403)
    for uid in ("student-essay", "essayadmin", None):
        expect(write(path, {"name": "Changed"}, uid), 403)
        expect(request("DELETE", documents + path, uid=uid), 403)
print("Passed essay configuration catalog and reference access-rule checks.")

# Frozen history stays readable, but cannot be rewritten by clients. A clear pauses pool/assignment writes.
expect(write("essayQuestionSnapshots/frozen-question", {"questionText": "Frozen task"}, "owner"), 200)
expect(request("GET", documents + "essayQuestionSnapshots/frozen-question", uid="student-essay"), 200)
expect(write("essayQuestionSnapshots/frozen-question", {"questionText": "Changed"}, "essayadmin"), 403)
expect(write("essayConfig/poolMaintenance", {"active": True}, "owner"), 200)
expect(write("essayQuestionGenerator/primary/standards/2/languages/Tamil/questions/blocked", {"questionText": "Blocked"}, "essayadmin"), 403)
expect(write("studentEssayPractices/student-essay/assignedEssayPractices/blocked", {"essayQuestionId": "blocked"}, "student-essay"), 403)
expect(write("essayConfig/poolMaintenance", {"active": False}, "owner"), 200)
print("Passed frozen essay and pool-maintenance access checks.")

expect(write("essayQuestionRetirements/retired-test", {"clearedAt": "test"}, "owner"), 200)
expect(write("essayQuestionGenerator/primary/standards/2/languages/Tamil/questions/retired-test", {"questionText": "Cannot restore"}, "essayadmin"), 403)
expect(write("essayQuestionGenerator/questionIndex/entries/retired-test", {"documentPath": "Cannot restore"}, "essayadmin"), 403)
print("Passed retired-question restore protection checks.")

expect(write("studentEssayPractices/student-essay/assignedEssayPractices/retired", {"essayQuestionId": "retired-test"}, "student-essay"), 403)
expect(write("studentEssayPractices/student-essay/completedEssayPractices/retired", {"essayQuestionId": "retired-test", "completedAt": "saved history"}, "student-essay"), 200)
print("Passed stale-assignment protection while retaining completion access.")
