"""Read sealed inputs and retain locators without copying source payloads."""
import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path


GROUPS = ("controlled-factorial", "adversarial-temporal", "jury-recursive")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def digest(path):
    hasher = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1048576), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def escape(value):
    return str(value).replace("~", "~0").replace("/", "~1")


def walk(value, pointer=""):
    yield pointer, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from walk(child, pointer + "/" + escape(key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk(child, pointer + "/" + str(index))


def resolve(value, pointer):
    if pointer in ("", "/"):
        return value
    if not pointer.startswith("/"):
        raise ValueError("Not a JSON pointer: " + pointer)
    for token in pointer[1:].split("/"):
        key = token.replace("~1", "/").replace("~0", "~")
        value = value[int(key)] if isinstance(value, list) else value[key]
    return value


def confined(root, relative):
    root = Path(root).resolve()
    target = (root / relative.replace("\\", "/")).resolve()
    target.relative_to(root)
    return target


@dataclass
class Document:
    label: str
    path: Path
    data: dict
    sha256: str
    reference_ids: dict = field(default_factory=dict)


class Catalog:
    def __init__(self):
        self.documents = []
        self.references = {}

    def load(self, path, seal):
        path = Path(path)
        before = digest(path)
        if seal is not None and before != seal:
            raise ValueError("Sealed SHA-256 mismatch: " + str(path))
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        if digest(path) != before:
            raise ValueError("Input changed while being read: " + str(path))
        document = Document(str(path), path, data, before)
        self.documents.append(document)
        return document

    def ref(self, document, pointer):
        resolve(document.data, pointer)
        return {"document": document.label, "pointer": pointer,
                "sha256": document.sha256}

    def collect(self, document):
        for pointer, record in walk(document.data):
            if isinstance(record, dict) and isinstance(record.get("file"), str):
                self._reference(document, (pointer, record))

    def _reference(self, document, location):
        pointer, record = location
        claimed = record.get("sha256")
        if claimed is None and "pointer" not in record:
            return
        value = {"file": record["file"], "pointer": record.get("pointer"),
                 "line": record.get("line"), "recordedSha256": claimed}
        encoded = json.dumps(value, sort_keys=True).encode("utf-8")
        identifier = "ref:" + hashlib.sha256(encoded).hexdigest()
        entry = self.references.setdefault(identifier, value)
        entry.setdefault("reportedBy", []).append(self.ref(document, pointer))
        entry["verification"] = "recorded_reference_not_reverified"
        entry["hashFormatValid"] = isinstance(claimed, str) and bool(SHA256.fullmatch(claimed))
        if isinstance(record.get("id"), str):
            document.reference_ids[record["id"]] = identifier

    def unchanged(self):
        changed = [str(doc.path) for doc in self.documents
                   if digest(doc.path) != doc.sha256]
        if changed:
            raise ValueError("Inputs changed during generation: " + ", ".join(changed))


def sealed_audits(root, catalog, manifest_sha=None):
    manifest = catalog.load(Path(root) / "manifest.json", manifest_sha)
    manifest.label = "manifest"
    records = {entry["path"].replace("\\", "/"): entry
               for entry in manifest.data["files"]}
    documents = []
    for group in GROUPS:
        relative = group + "/audit.json"
        if relative not in records:
            raise ValueError("Audit missing from sealed manifest: " + relative)
        document = catalog.load(confined(root, relative), records[relative]["sha256"])
        if document.path.stat().st_size != records[relative]["bytes"]:
            raise ValueError("Sealed input size mismatch: " + relative)
        document.label = group
        catalog.collect(document)
        documents.append(document)
    return documents


def mission_seal(documents):
    hashes = set()
    for document in documents:
        for _, record in walk(document.data):
            if isinstance(record, dict) and "file" in record:
                name = str(record["file"]).replace("\\", "/").split("/")[-1]
                if name == "missions.json" and record.get("sha256"):
                    hashes.add(record["sha256"])
    if len(hashes) != 1:
        raise ValueError("Exactly one mission-source hash anchor is required")
    return hashes.pop()
