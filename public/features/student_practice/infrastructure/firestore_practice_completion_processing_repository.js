import {
  COMPLETION_PROCESSING_SUBCOLLECTION,
  STUDENT_PRACTICES_COLLECTION
} from "../../../config/firebase/student_practice_schema.js";
import {
  watchDocument
} from "../../../utils/firebase/firebase_ops.js?v=20261003-watch-document-v1";
import {
  normalizeCompletionProcessingIdentity,
  normalizeCompletionProcessingRecord
} from "../domain/practice_completion_processing.js";
import {
  PracticeCompletionProcessingRepository
} from "../domain/practice_completion_processing_repository.js";

function completionProcessingCollectionPath(studentId) {
  return [
    STUDENT_PRACTICES_COLLECTION,
    studentId,
    COMPLETION_PROCESSING_SUBCOLLECTION
  ].join("/");
}

export class FirestorePracticeCompletionProcessingRepository
  extends PracticeCompletionProcessingRepository {
  constructor({watchDocumentOperation = watchDocument} = {}) {
    super();
    this.watchDocument = watchDocumentOperation;
  }

  watch({studentId, practiceId, onChange, onError} = {}) {
    const identity = normalizeCompletionProcessingIdentity({
      studentId,
      practiceId
    });

    return this.watchDocument(
      completionProcessingCollectionPath(identity.studentId),
      identity.practiceId,
      (record) => {
        try {
          onChange(normalizeCompletionProcessingRecord(record));
        } catch (error) {
          onError(error);
        }
      },
      onError,
      {includeId: false}
    );
  }
}

export {completionProcessingCollectionPath};
