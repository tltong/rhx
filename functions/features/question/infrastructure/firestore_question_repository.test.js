const assert = require("node:assert/strict");
const test = require("node:test");

const {
  practiceTypes,
} = require("../../../schema/practice_schema");
const {
  FirestoreQuestionRepository,
} = require("./firestore_question_repository");

function questionInput(overrides = {}) {
  return {
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    questionText: "What is 1 + 1?",
    options: {
      a: "1",
      b: "2",
      c: "3",
      d: "4",
    },
    correctAnswer: "b",
    group: practiceTypes.ASSESSMENT,
    explanation: "One plus one equals two.",
    hasDiagram: false,
    svg: "",
    difficulty: "Easy",
    language: "English",
    specialInstruction: "",
    ...overrides,
  };
}

test("save routes a question through language and diagram group documents", async () => {
  const writes = [];
  const creates = [];
  const repository = new FirestoreQuestionRepository({
    writeDocument: async (...args) => {
      writes.push(args);
    },
    createDocument: async (collectionPath, data) => {
      creates.push({ collectionPath, data });
      return { id: "question-1" };
    },
  });

  const question = await repository.save(questionInput());

  assert.equal(question.id, "question-1");
  assert.equal(
    creates[0].collectionPath,
    "questions/syllabus-1/topics/topic-1/languages/english/"
      + "diagramGroups/withoutDiagram/questionItems",
  );
  assert.ok(writes.some(([collectionPath, documentId, data]) => (
    collectionPath === "questions/syllabus-1/topics/topic-1/languages"
    && documentId === "english"
    && data.language === "English"
  )));
  assert.ok(writes.some(([collectionPath, documentId, data]) => (
    collectionPath
      === "questions/syllabus-1/topics/topic-1/languages/english/diagramGroups"
    && documentId === "withoutDiagram"
    && data.hasDiagram === false
  )));
});

test("save updates an existing question in its resolved branch", async () => {
  const writes = [];
  const repository = new FirestoreQuestionRepository({
    writeDocument: async (...args) => {
      writes.push(args);
      return { id: args[1], path: `${args[0]}/${args[1]}` };
    },
  });

  await repository.save(questionInput({
    id: "question-2",
    language: "Chinese",
    hasDiagram: true,
    svg: "<svg></svg>",
  }));

  assert.ok(writes.some(([collectionPath, documentId, data, options]) => (
    collectionPath
      === "questions/syllabus-1/topics/topic-1/languages/chinese/"
        + "diagramGroups/withDiagram/questionItems"
    && documentId === "question-2"
    && data.questionText === "What is 1 + 1?"
    && options.merge === false
  )));
});

test("getById derives a dynamic language ID and diagram branch", async () => {
  const reads = [];
  const data = questionInput({
    id: "question-2",
    language: "Bahasa Melayu",
    hasDiagram: true,
    svg: "<svg></svg>",
  });
  const repository = new FirestoreQuestionRepository({
    readDocument: async (collectionPath, documentId) => {
      reads.push({ collectionPath, documentId });
      return data;
    },
  });

  const question = await repository.getById({
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    language: "Bahasa Melayu",
    hasDiagram: true,
    questionId: "question-2",
  });

  assert.equal(question.id, "question-2");
  assert.deepEqual(reads[0], {
    collectionPath:
      "questions/syllabus-1/topics/topic-1/languages/bahasa%20melayu/"
      + "diagramGroups/withDiagram/questionItems",
    documentId: "question-2",
  });
});

test("getById requires language and diagram routing fields", async () => {
  const repository = new FirestoreQuestionRepository();

  await assert.rejects(
    repository.getById({
      syllabusId: "syllabus-1",
      topicId: "topic-1",
      questionId: "question-1",
    }),
    /language is required/,
  );
});

test("countByGroup counts only the resolved language and diagram branch", async () => {
  const paths = [];
  const repository = new FirestoreQuestionRepository({
    countCollection: async (collectionPath) => {
      paths.push(collectionPath);
      return 12;
    },
  });

  const count = await repository.countByGroup({
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    language: "English",
    hasDiagram: false,
  });

  assert.equal(count, 12);
  assert.equal(
    paths[0],
    "questions/syllabus-1/topics/topic-1/languages/english/"
      + "diagramGroups/withoutDiagram/questionItems",
  );
});

test("listIdsByGroup returns IDs from the resolved group branch", async () => {
  const repository = new FirestoreQuestionRepository({
    readCollectionIds: async (collectionPath) => {
      assert.equal(
        collectionPath,
        "questions/syllabus-1/topics/topic-1/languages/english/"
          + "diagramGroups/withoutDiagram/questionItems",
      );
      return ["question-006", "question-007"];
    },
  });

  const questionIds = await repository.listIdsByGroup({
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    language: "English",
    hasDiagram: false,
  });

  assert.deepEqual(questionIds, ["question-006", "question-007"]);
});

test("listByTopic applies difficulty before its result limit", async () => {
  const queryCalls = [];
  const repository = new FirestoreQuestionRepository({
    readCollection: async (_collectionPath, queryBuilder) => {
      const query = {
        where: (...args) => {
          queryCalls.push(["where", ...args]);
          return query;
        },
        limit: (...args) => {
          queryCalls.push(["limit", ...args]);
          return query;
        },
      };

      queryBuilder(query);

      return [
        questionInput({ id: "question-hard", difficulty: "Hard" }),
        questionInput({ id: "question-easy-2", difficulty: "Easy" }),
        questionInput({ id: "question-easy-1", difficulty: "easy" }),
      ];
    },
  });

  const questions = await repository.listByTopic(
    "syllabus-1",
    "topic-1",
    {
      language: "English",
      hasDiagram: false,
      difficulty: "EASY",
      group: practiceTypes.ASSESSMENT,
      limit: 1,
    },
  );

  assert.deepEqual(
    questions.map((question) => question.id),
    ["question-easy-1"],
  );
  assert.deepEqual(queryCalls, [
    ["where", "group", "==", practiceTypes.ASSESSMENT],
  ]);
});

test("delete removes a question from its resolved branch", async () => {
  const repository = new FirestoreQuestionRepository({
    deleteDocument: async (collectionPath, documentId) => ({
      id: documentId,
      path: `${collectionPath}/${documentId}`,
    }),
  });

  const result = await repository.delete({
    syllabusId: "syllabus-1",
    topicId: "topic-1",
    language: "English",
    hasDiagram: false,
    questionId: "question-8",
  });

  assert.deepEqual(result, {
    id: "question-8",
    path:
      "questions/syllabus-1/topics/topic-1/languages/english/"
      + "diagramGroups/withoutDiagram/questionItems/question-8",
  });
});
