"""Private, independently deployed Firebase Python HTTP function for PaddleOCR."""

from firebase_functions import https_fn, options

from service import handle_request


@https_fn.on_request(
    region="us-central1",
    invoker="private",
    memory=options.MemoryOption.GB_4,
    cpu=2,
    concurrency=1,
    min_instances=0,
    max_instances=2,
    timeout_sec=240,
)
def extractPaddleOcrText(req: https_fn.Request) -> https_fn.Response:
    """IAM authorizes the calling backend before this handler processes an image."""
    return handle_request(req)
