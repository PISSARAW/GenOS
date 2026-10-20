"""Tamper-evident lineage archive for isolated scaffold candidates."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


PROTECTED_PREFIXES = ("evaluator/", "permissions/", "promotion/", "gates/")
REQUIRED_CANDIDATE_FIELDS = {
    "candidate_id", "parent_id", "author_id", "patch_sha256", "scaffold_sha256",
    "capsule_id", "snapshot_id", "changed_paths", "created_at",
}


def canonical_hash(value: dict) -> str:
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def require_digest(value: object, label: str) -> str:
    if not isinstance(value, str) or len(value) != 64:
        raise ValueError(f"{label} must be a sha256 digest")
    try:
        int(value, 16)
    except ValueError as error:
        raise ValueError(f"{label} must be a sha256 digest") from error
    return value.lower()


def normalize_paths(paths: object) -> list[str]:
    if not isinstance(paths, list) or not paths:
        raise ValueError("changed_paths must be a non-empty list")
    normalized = [str(path).replace("\\", "/") for path in paths]
    if any(path.startswith("/") or ".." in path.split("/") for path in normalized):
        raise ValueError("unsafe candidate path")
    if any(path.startswith(PROTECTED_PREFIXES) for path in normalized):
        raise ValueError("candidate modified a protected authority path")
    return sorted(set(normalized))


class ScaffoldLineageArchive:
    """Append-only JSONL ledger; it records evidence but never promotes a candidate."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.events = self._load()

    def register_root(self, record: dict) -> dict:
        required = {"candidate_id", "scaffold_sha256", "snapshot_id", "created_at"}
        self._require_fields(record, required)
        if self.events:
            raise ValueError("root already registered")
        payload = dict(record)
        payload["scaffold_sha256"] = require_digest(payload["scaffold_sha256"], "scaffold_sha256")
        return self._append("ROOT_REGISTERED", payload)

    def register_candidate(self, record: dict) -> dict:
        self._require_fields(record, REQUIRED_CANDIDATE_FIELDS)
        self._require_unique_candidate(record["candidate_id"])
        parent = self._candidate(record["parent_id"])
        self._require_isolation(record, parent)
        payload = dict(record)
        payload["patch_sha256"] = require_digest(payload["patch_sha256"], "patch_sha256")
        payload["scaffold_sha256"] = require_digest(payload["scaffold_sha256"], "scaffold_sha256")
        payload["changed_paths"] = normalize_paths(payload["changed_paths"])
        return self._append("CANDIDATE_REGISTERED", payload)

    def record_failure(self, record: dict) -> dict:
        required = {"candidate_id", "phase", "error_code", "evidence_refs", "observed_at"}
        self._require_fields(record, required)
        self._candidate(record["candidate_id"])
        if not isinstance(record["evidence_refs"], list) or not record["evidence_refs"]:
            raise ValueError("failure evidence_refs required")
        return self._append("CANDIDATE_FAILED", dict(record))

    def candidate_lineage(self, candidate_id: str) -> list[str]:
        lineage = []
        current = self._candidate(candidate_id)
        while current:
            lineage.append(current["candidate_id"])
            parent_id = current.get("parent_id")
            current = self._candidate(parent_id) if parent_id else None
        return list(reversed(lineage))

    def _load(self) -> list[dict]:
        if not self.path.exists():
            return []
        rows = [json.loads(line) for line in self.path.read_text(encoding="utf-8").splitlines() if line]
        self._verify_chain(rows)
        return rows

    def _verify_chain(self, rows: list[dict]) -> None:
        previous = None
        for sequence, row in enumerate(rows, start=1):
            received_hash = row.get("event_hash")
            unsigned = {key: value for key, value in row.items() if key != "event_hash"}
            if row.get("sequence") != sequence or row.get("previous_hash") != previous:
                raise ValueError("lineage archive chain mismatch")
            if received_hash != canonical_hash(unsigned):
                raise ValueError("lineage archive event hash mismatch")
            previous = received_hash

    def _append(self, event_type: str, payload: dict) -> dict:
        event = {
            "sequence": len(self.events) + 1,
            "previous_hash": self.events[-1]["event_hash"] if self.events else None,
            "event_type": event_type,
            "payload": payload,
        }
        event["event_hash"] = canonical_hash(event)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")
        self.events.append(event)
        return event

    def _candidate(self, candidate_id: str | None) -> dict | None:
        if candidate_id is None:
            return None
        for event in self.events:
            if event["event_type"] in {"ROOT_REGISTERED", "CANDIDATE_REGISTERED"}:
                if event["payload"]["candidate_id"] == candidate_id:
                    return event["payload"]
        raise ValueError(f"unknown candidate: {candidate_id}")

    def _require_unique_candidate(self, candidate_id: str) -> None:
        try:
            self._candidate(candidate_id)
        except ValueError:
            return
        raise ValueError(f"duplicate candidate: {candidate_id}")

    def _require_isolation(self, record: dict, parent: dict) -> None:
        candidate_capsule = record.get("capsule_id")
        if not candidate_capsule or not record.get("snapshot_id"):
            raise ValueError("candidate isolation receipt required")
        used_capsules = {
            event["payload"].get("capsule_id") for event in self.events
            if event["event_type"] == "CANDIDATE_REGISTERED"
        }
        if candidate_capsule in used_capsules or candidate_capsule == parent.get("capsule_id"):
            raise ValueError("candidate capsule must be isolated")

    @staticmethod
    def _require_fields(record: dict, required: set[str]) -> None:
        if not isinstance(record, dict) or not required <= record.keys():
            raise ValueError(f"missing fields: {sorted(required - set(record or {}))}")
