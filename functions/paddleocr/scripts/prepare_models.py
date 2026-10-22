#!/usr/bin/env python3
"""Bundle the pinned PP-OCRv6 models before deployment; never run during a request."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import tempfile
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MODELS_ROOT = ROOT / "models"
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def verify(directory, specification):
    if directory.is_symlink():
        raise RuntimeError(f"Model directory must not be a symlink: {directory}")
    for filename, expected in specification["files"].items():
        path = directory / filename
        if not path.is_file() or path.is_symlink():
            raise RuntimeError(f"Missing model file: {path}")
        if sha256(path) != expected:
            raise RuntimeError(f"Model checksum mismatch: {path}")


def download(specification, archive):
    url = specification["url"]
    if urllib.parse.urlsplit(url).scheme != "https":
        raise RuntimeError("Model downloads require HTTPS.")
    request = urllib.request.Request(url, headers={"User-Agent": "rhx-paddleocr-model-bundler/1"})
    # One attempt. Preserve normal proxy and certificate handling.
    with urllib.request.urlopen(request, timeout=60) as response, archive.open("xb") as output:
        if urllib.parse.urlsplit(response.geturl()).scheme != "https":
            raise RuntimeError("Model download redirected away from HTTPS.")
        size = 0
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_ARCHIVE_BYTES:
                raise RuntimeError("Model archive exceeds the permitted size.")
            output.write(chunk)
    if sha256(archive) != specification["archive_sha256"]:
        raise RuntimeError(f"Model archive checksum mismatch: {archive.name}")


def unpack(archive, destination, name, specification):
    prefix = f"{name}_infer"
    found = set()
    with tarfile.open(archive) as stream:
        for member in stream.getmembers():
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or not path.parts or path.parts[0] != prefix:
                raise RuntimeError(f"Unsafe model archive member: {member.name}")
            if member.isdir() and len(path.parts) == 1:
                continue
            if not member.isfile() or len(path.parts) != 2:
                raise RuntimeError(f"Unsupported model archive member: {member.name}")
            filename = path.parts[1]
            if filename not in specification["files"] or filename in found:
                raise RuntimeError(f"Unexpected or duplicate model archive member: {member.name}")
            if member.size > MAX_ARCHIVE_BYTES:
                raise RuntimeError("Model archive member exceeds the permitted size.")
            found.add(filename)
            with stream.extractfile(member) as source, (destination / filename).open("xb") as output:
                shutil.copyfileobj(source, output)
    if found != set(specification["files"]):
        raise RuntimeError(f"Model archive is missing required files: {name}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--source-dir", type=Path, help="Copy verified models from an existing local models directory")
    source.add_argument("--verify", action="store_true", help="Verify bundled files without downloading or changing anything")
    args = parser.parse_args()
    manifest = json.loads((ROOT / "models.json").read_text(encoding="utf-8"))
    if manifest.get("format") != 1:
        raise RuntimeError("Unsupported model manifest format.")
    if MODELS_ROOT.is_symlink():
        raise RuntimeError("The bundled models directory must not be a symlink.")
    if not args.verify:
        MODELS_ROOT.mkdir(exist_ok=True)
    for name, specification in manifest["models"].items():
        target = MODELS_ROOT / name
        if args.verify or target.exists():
            verify(target, specification)
            continue
        with tempfile.TemporaryDirectory(prefix=".prepare-", dir=MODELS_ROOT) as temporary:
            staging = Path(temporary)
            model = staging / name
            model.mkdir()
            if args.source_dir:
                origin = args.source_dir / name
                verify(origin, specification)
                for filename in specification["files"]:
                    shutil.copyfile(origin / filename, model / filename)
            else:
                archive = staging / "model.tar"
                download(specification, archive)
                unpack(archive, model, name, specification)
            verify(model, specification)
            model.rename(target)
    size = sum((MODELS_ROOT / name / filename).stat().st_size
               for name, specification in manifest["models"].items()
               for filename in specification["files"])
    print(json.dumps({"status": "verified", "models": list(manifest["models"]), "bytes": size}))


if __name__ == "__main__":
    main()
