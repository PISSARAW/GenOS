"""Compare E12 business-backend outputs against the independent oracle."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKENDS = ("python", "node", "rust")


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def main():
    expected = read_jsonl(ROOT / "dataset/oracle/E12.jsonl")
    expected_by_id = {row["scenario_id"]: row["expected"] for row in expected}
    for backend in BACKENDS:
        rows = read_jsonl(ROOT / f"results/E12-{backend}.jsonl")
        mismatches = []
        for row in rows:
            wanted = expected_by_id.get(row["scenario_id"])
            actual = {key: row[key] for key in ("valid", "unauthorized", "malformed")}
            if actual != wanted:
                mismatches.append(row["scenario_id"])
        print(f"{backend}: {len(rows)} cases; {len(mismatches)} mismatches")
        if mismatches:
            raise SystemExit(f"E12 backend mismatch: {backend}: {mismatches[:5]}")
    print("E12 backend parity and unauthorized/malformed zero-side-effect checks passed.")


if __name__ == "__main__":
    main()
