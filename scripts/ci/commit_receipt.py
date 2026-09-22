#!/usr/bin/env python3
"""GenOS Commit Receipt — verify that files listed in the commit message
are present in the staged diff.

A commit message MAY declare a receipt block:
  [FIX] Example change
  ...
  Receipt:
    backend/src/foo.js
    backend/src/bar.js

If present, every file in Receipt: must appear in `git diff --cached --name-only`.
If any are missing or extra files are staged, the commit is rejected.
If no Receipt: block exists, the check passes (backwards-compatible).
"""

import subprocess
import sys


def staged_files():
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only"],
        capture_output=True, text=True, check=True,
    )
    return set(line for line in result.stdout.splitlines() if line)


def parse_receipt(commit_msg):
    """Return list of files declared in a 'Receipt:' block, or None if absent."""
    in_receipt = False
    files = []
    for line in commit_msg.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("receipt:"):
            in_receipt = True
            continue
        if in_receipt:
            # End block on blank line or new section (non-indented, non-comment)
            if not stripped:
                break
            # Accept "- path", "* path", or bare path
            if stripped.startswith("- ") or stripped.startswith("* "):
                files.append(stripped[2:].strip())
            elif stripped.startswith("#"):
                continue  # comment line
            else:
                files.append(stripped)
    return files if in_receipt else None


def main():
    if len(sys.argv) < 2:
        print("Usage: commit_receipt.py <commit-msg-file>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1], "r", encoding="utf-8") as f:
        commit_msg = f.read()

    declared = parse_receipt(commit_msg)
    if declared is None:
        # No receipt block — nothing to verify.
        sys.exit(0)

    declared_set = set(declared)
    staged = staged_files()

    missing = declared_set - staged
    extra = staged - declared_set

    if missing:
        print("❌ [Commit Receipt] Fichier(s) declare(s) absent(s) du diff:", file=sys.stderr)
        for f in sorted(missing):
            print(f"  - {f}", file=sys.stderr)
    if extra:
        print("❌ [Commit Receipt] Fichier(s) stage(s) non declare(s):", file=sys.stderr)
        for f in sorted(extra):
            print(f"  - {f}", file=sys.stderr)

    if missing or extra:
        print("", file=sys.stderr)
        print("Le message de commit doit lister exactement les fichiers modifies.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
