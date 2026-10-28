"""Create an assessor-only holdout outside the public repository."""
import hashlib
import json
import os
import random
import secrets
from pathlib import Path

from generate_dataset import BUILDERS, COUNTS, DATASET_VERSION, canonical

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_ROOT = Path.home() / ".codex" / "benchmark-secrets" / "omega-bench-2026"
SEED_PATH = PRIVATE_ROOT / "holdout.seed"
HOLDOUT_ROOT = PRIVATE_ROOT / f"holdout-v{DATASET_VERSION}"
PUBLIC_MANIFEST = ROOT / "dataset" / "manifest.json"
HOLDOUT_COUNTS = {name: count // 5 for name, count in COUNTS.items()}


def manifest_digest():
    return hashlib.sha256(PUBLIC_MANIFEST.read_bytes()).hexdigest()


def private_seed():
    PRIVATE_ROOT.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(SEED_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        value = SEED_PATH.read_text(encoding="ascii").strip()
        if len(value) != 64 or any(char not in "0123456789abcdef" for char in value):
            raise ValueError("The local holdout seed file is malformed.")
        return int(value, 16), value
    value = secrets.token_hex(32)
    with os.fdopen(descriptor, "w", encoding="ascii") as stream:
        stream.write(value)
    try:
        SEED_PATH.chmod(0o600)
        PRIVATE_ROOT.chmod(0o700)
    except OSError:
        pass
    return int(value, 16), value


def write_cases(seed, stage):
    digests = {}
    for number, (experiment, count) in enumerate(sorted(HOLDOUT_COUNTS.items()), 1):
        inputs, oracle = [], []
        for index in range(count):
            rng = random.Random(f"{seed}:{experiment}:{index}")
            case_input, expected = BUILDERS[number - 1](index, rng)
            scenario_id = f"H-{experiment}-{index:03d}"
            case_seed = int.from_bytes(hashlib.sha256(
                f"{seed}:{experiment}:{index}".encode()).digest()[:4], "big")
            inputs.append({"scenario_id": scenario_id, "experiment_id": experiment,
                           "seed": case_seed, "input": case_input})
            oracle.append({"scenario_id": scenario_id, "experiment_id": experiment,
                           "expected": expected})
        for split, rows in (("inputs", inputs), ("oracle", oracle)):
            payload = "".join(canonical(row) + "\n" for row in rows).encode("utf-8")
            file_path = stage / split / f"{experiment}.jsonl"
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_bytes(payload)
            digests[f"{split}/{experiment}.jsonl"] = hashlib.sha256(payload).hexdigest()
    return digests


def verify_manifest(manifest_path):
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("dataset_version") != DATASET_VERSION:
        return None, "private holdout dataset version is stale"
    if manifest.get("dataset_manifest_sha256") != manifest_digest():
        return None, "private holdout public-manifest commitment is stale"
    seed = SEED_PATH.read_text(encoding="ascii").strip()
    seed_hash = hashlib.sha256(bytes.fromhex(seed)).hexdigest()
    if manifest.get("seed_commitment") != seed_hash:
        return None, "holdout seed commitment does not match"
    if manifest.get("scenario_count") != sum(HOLDOUT_COUNTS.values()):
        return None, "holdout sample count does not match the 20 percent design"
    return manifest, None


def verify_holdout_files(path, manifest):
    observed = {}
    for split in ("inputs", "oracle"):
        for name in HOLDOUT_COUNTS:
            file_path = path / split / f"{name}.jsonl"
            if not file_path.is_file():
                return f"holdout file is missing: {split}/{name}.jsonl"
            data = file_path.read_bytes()
            rows = [line for line in data.splitlines() if line.strip()]
            if len(rows) != HOLDOUT_COUNTS[name]:
                return f"holdout count is invalid: {split}/{name}.jsonl"
            observed[f"{split}/{name}.jsonl"] = hashlib.sha256(data).hexdigest()
    if observed != manifest.get("sha256"):
        return "holdout content hashes do not match the private manifest"
    return None


def verify_holdout(path=HOLDOUT_ROOT):
    if path.resolve().is_relative_to(ROOT.resolve()):
        return False, "holdout path must remain outside the public repository"
    manifest_path = path / "manifest.json"
    if not manifest_path.is_file() or not SEED_PATH.is_file():
        return False, "private holdout or seed commitment is missing"
    manifest, error = verify_manifest(manifest_path)
    if error:
        return False, error
    error = verify_holdout_files(path, manifest)
    if error:
        return False, error
    return True, f"verified={sum(HOLDOUT_COUNTS.values())}; location=outside_repository"


def main():
    seed, seed_text = private_seed()
    if HOLDOUT_ROOT.exists():
        valid, detail = verify_holdout()
        if not valid:
            raise RuntimeError(f"Existing private holdout is invalid: {detail}")
        print(detail)
        return
    staging = PRIVATE_ROOT / f"holdout-staging-{secrets.token_hex(8)}"
    hashes = write_cases(seed, staging)
    manifest = {"protocol": "OMEGA-BENCH-2026", "dataset_version": DATASET_VERSION,
                "dataset_manifest_sha256": manifest_digest(),
                "holdout_id": secrets.token_hex(16), "split": "sealed_assessor_only",
                "scenario_count": sum(HOLDOUT_COUNTS.values()),
                "cases_by_experiment": HOLDOUT_COUNTS,
                "seed_commitment": hashlib.sha256(bytes.fromhex(seed_text)).hexdigest(),
                "sha256": hashes}
    (staging / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    staging.rename(HOLDOUT_ROOT)
    valid, detail = verify_holdout()
    if not valid:
        raise RuntimeError(f"Generated private holdout failed verification: {detail}")
    print(detail)


if __name__ == "__main__":
    main()
