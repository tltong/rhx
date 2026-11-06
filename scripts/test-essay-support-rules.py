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
